import { randomUUID } from 'node:crypto';
import { canonicalHash } from '@/shared/canonical-json';
import { database } from '@/shared/database';
import { AppError } from '@/shared/errors';
import type { QuoteSnapshot } from '@/modules/authorization/contracts';
import { ReapClient, reapMoney } from './client';
import { getPurchasePlan } from './plans';

interface QuoteRow { id: string; case_id: string; plan_id: string; provider_id: string | null; status: string;
  idempotency_key: string; request_hash: string; snapshot: QuoteSnapshot | null; expires_at: Date | null; created_at: Date }
export interface QuoteView { id: string; caseId: string; planId: string; status: string; snapshot: QuoteSnapshot | null; createdAt: string }
function view(row: QuoteRow): QuoteView { return { id: row.id, caseId: row.case_id, planId: row.plan_id, status: row.status,
  snapshot: row.snapshot, createdAt: row.created_at.toISOString() }; }

export async function createQuote(input: { caseId: string; planId: string; key: string }, client = new ReapClient()): Promise<QuoteView> {
  if (!input.key || input.key.length > 255) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Se requiere Idempotency-Key');
  const plan = await getPurchasePlan(input.planId);
  if (plan.caseId !== input.caseId) throw new AppError(422, 'PLAN_CASE_MISMATCH', 'El plan pertenece a otro caso');
  const current = await database().query<{ po_id: string | null; po_version: number | null; status: string }>('SELECT po_id,po_version,status FROM cases WHERE id=$1', [input.caseId]);
  if (current.rows[0]?.po_id !== plan.po.documentId || current.rows[0].po_version !== plan.po.version) throw new AppError(409, 'PO_CHANGED', 'La PO del plan cambió');
  if (['REJECTED','PAYING','PROCESSING','COMPLETED','UNKNOWN'].includes(current.rows[0].status)) throw new AppError(409, 'CASE_CLOSED', 'El caso no admite cotizaciones');
  const requestHash = canonicalHash({ planId: plan.id, hash: plan.hash });
  const prior = await database().query<QuoteRow>('SELECT * FROM reap_quotes WHERE idempotency_key=$1', [input.key]);
  if (prior.rows[0]) {
    if (prior.rows[0].request_hash !== requestHash) throw new AppError(422, 'IDEMPOTENCY_MISMATCH', 'La clave ya se usó para otro plan');
    return view(prior.rows[0]);
  }
  const created = await database().query<QuoteRow>(`INSERT INTO reap_quotes(id,case_id,plan_id,status,idempotency_key,request_hash)
    VALUES($1,$2,$3,'UNKNOWN',$4,$5) ON CONFLICT(idempotency_key) DO NOTHING RETURNING *`,
    [randomUUID(), input.caseId, plan.id, input.key, requestHash]);
  if (!created.rows[0]) throw new AppError(409, 'QUOTE_IN_PROGRESS', 'La cotización está en curso');
  return retryQuote(created.rows[0].id, client);
}

export async function retryQuote(id: string, client = new ReapClient()): Promise<QuoteView> {
  const found = await database().query<QuoteRow>('SELECT * FROM reap_quotes WHERE id=$1', [id]);
  const row = found.rows[0];
  if (!row) throw new AppError(404, 'QUOTE_NOT_FOUND', 'Cotización no encontrada');
  if (row.provider_id) return view(row);
  if (Date.now() - row.created_at.getTime() > 23 * 60 * 60 * 1_000) throw new AppError(409, 'REAP_RESULT_UNKNOWN', 'La solicitud incierta debe resolverse con Reap');
  const plan = await getPurchasePlan(row.plan_id);
  const result = await client.createQuote({ email: process.env.REAP_OWNER_EMAIL ?? '',
    items: plan.selections.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
    shippingAddress: plan.shippingAddress, idempotencyKey: row.idempotency_key });
  const amount = reapMoney(result.amountBreakdown.finalAmount);
  const snapshot: QuoteSnapshot = { quoteId: result.id, merchantId: 'acteck', merchantWebsite: plan.merchantWebsite,
    purchasePlanHash: plan.hash, amount, expiresAt: result.expiresAt,
    termsHash: canonicalHash({ planHash: plan.hash, quote: result }) };
  const updated = await database().query<QuoteRow>(`UPDATE reap_quotes SET provider_id=$2,status='READY',snapshot=$3,expires_at=$4 WHERE id=$1 RETURNING *`,
    [id, result.id, snapshot, result.expiresAt]);
  return view(updated.rows[0]);
}

export async function getQuote(id: string, refresh = false, client = new ReapClient()): Promise<QuoteView> {
  const found = await database().query<QuoteRow>('SELECT * FROM reap_quotes WHERE id=$1', [id]);
  const row = found.rows[0];
  if (!row) throw new AppError(404, 'QUOTE_NOT_FOUND', 'Cotización no encontrada');
  if (!refresh || !row.provider_id || row.status !== 'READY') return view(row);
  const actual = await client.getQuote(row.provider_id);
  const plan = await getPurchasePlan(row.plan_id);
  const snapshot: QuoteSnapshot = { quoteId: actual.id, merchantId: 'acteck', merchantWebsite: plan.merchantWebsite,
    purchasePlanHash: plan.hash, amount: reapMoney(actual.amountBreakdown.finalAmount), expiresAt: actual.expiresAt,
    termsHash: canonicalHash({ planHash: plan.hash, quote: actual }) };
  const status = Date.parse(actual.expiresAt) <= Date.now() ? 'EXPIRED' : 'READY';
  const updated = await database().query<QuoteRow>('UPDATE reap_quotes SET status=$2,snapshot=$3,expires_at=$4 WHERE id=$1 RETURNING *',
    [id, status, snapshot, actual.expiresAt]);
  return view(updated.rows[0]);
}

export async function latestQuote(caseId: string): Promise<QuoteView | null> {
  const found = await database().query<QuoteRow>('SELECT * FROM reap_quotes WHERE case_id=$1 ORDER BY created_at DESC LIMIT 1', [caseId]);
  return found.rows[0] ? view(found.rows[0]) : null;
}
