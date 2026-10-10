import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { canonicalHash } from '@/shared/canonical-json';
import { database, transaction } from '@/shared/database';
import { AppError } from '@/shared/errors';
import { sameMoney, type Money } from '@/shared/money';
import { completeGrant, getPaymentGrant, releaseVerifiedFailure, reserveGrant } from '@/modules/authorization/service';
import { verifyEvidence } from '@/modules/ap2-evidence/service';
import { ReapClient, reapMoney, type ReapCheckout } from './client';

type PaymentStatus = 'RESERVED' | 'SUBMITTING' | 'UNKNOWN' | 'REQUIRES_ACTION' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
interface IntentRow { id: string; case_id: string; grant_id: string; evidence_id: string; idempotency_key: string;
  request_body: { quoteId: string; enrollmentId: string; returnUrl: string }; request_hash: string;
  status: PaymentStatus; checkout_id: string | null; order_id: string | null; final_amount: Money | null;
  next_action_url: string | null; amount_mismatch: boolean; attempts: number; created_at: Date }
export interface PaymentOutcome { paymentIntentId: string; status: PaymentStatus; checkoutId: string | null; orderId: string | null;
  finalAmount: Money | null; nextActionUrl: string | null; amountMismatch: boolean }
function view(row: IntentRow): PaymentOutcome { return { paymentIntentId: row.id, status: row.status, checkoutId: row.checkout_id,
  orderId: row.order_id, finalAmount: row.final_amount, nextActionUrl: row.next_action_url, amountMismatch: row.amount_mismatch }; }
function stateHash(value: string) { return createHash('sha256').update(value).digest('hex'); }

export async function executePayment(grantId: string, evidenceId: string, client = new ReapClient()): Promise<PaymentOutcome> {
  const prior = await database().query<IntentRow>('SELECT * FROM payment_intents WHERE grant_id=$1', [grantId]);
  if (prior.rows[0]) {
    if (prior.rows[0].evidence_id !== evidenceId) throw new AppError(409, 'INTENT_EXISTS', 'La PO ya tiene otra intención');
    return view(prior.rows[0]);
  }
  const grant = await getPaymentGrant(grantId);
  if (grant.state !== 'AVAILABLE') throw new AppError(409, 'GRANT_NOT_AVAILABLE', 'El permiso ya no está disponible');
  const evidence = await database().query<{ grant_id: string }>('SELECT grant_id FROM ap2_evidence WHERE id=$1', [evidenceId]);
  if (evidence.rows[0]?.grant_id !== grantId) throw new AppError(422, 'EVIDENCE_MISMATCH', 'La evidencia no pertenece al permiso');
  await verifyEvidence(evidenceId);
  const [enrollment, quote] = await Promise.all([client.getEnrollment(grant.enrollmentId), client.getQuote(grant.quote.quoteId)]);
  if (enrollment.status !== 'ACTIVE') throw new AppError(409, 'ENROLLMENT_NOT_ACTIVE', 'La tarjeta aún no está activa');
  if (Date.parse(quote.expiresAt) <= Date.now() ||
      canonicalHash({ planHash: grant.quote.purchasePlanHash, quote }) !== grant.quote.termsHash ||
      !sameMoney(reapMoney(quote.amountBreakdown.finalAmount), grant.quote.amount)) {
    throw new AppError(409, 'QUOTE_CHANGED', 'La cotización cambió o venció');
  }
  const base = process.env.APP_BASE_URL ?? '';
  if (!base.startsWith('https://')) throw new AppError(503, 'HTTPS_REQUIRED', 'Configura una URL pública HTTPS para Reap');
  const id = randomUUID();
  const state = randomBytes(32).toString('base64url');
  const requestBody = { quoteId: grant.quote.quoteId, enrollmentId: grant.enrollmentId,
    returnUrl: `${base}/payments/return?intent=${id}&state=${encodeURIComponent(state)}` };
  const key = randomUUID();
  const row = await transaction(async (sql) => {
    const inserted = await sql.query<IntentRow>(`INSERT INTO payment_intents
      (id,case_id,grant_id,evidence_id,idempotency_key,request_body,request_hash,return_state_hash,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'RESERVED') RETURNING *`,
      [id, grant.caseId, grantId, evidenceId, key, requestBody, canonicalHash(requestBody), stateHash(state)]);
    await reserveGrant(sql, grantId, id);
    return inserted.rows[0];
  });
  return submitIntent(row.id, client);
}

async function persistCheckout(row: IntentRow, checkout: ReapCheckout): Promise<PaymentOutcome> {
  if (checkout.quoteId !== row.request_body.quoteId || checkout.enrollmentId !== row.request_body.enrollmentId) {
    throw new AppError(502, 'REAP_CHECKOUT_MISMATCH', 'Reap devolvió otro checkout');
  }
  const final = checkout.status === 'COMPLETED' ? checkout.finalAmount : null;
  const grant = await getPaymentGrant(row.grant_id);
  if (checkout.status === 'COMPLETED' && (!checkout.orderId || !final)) {
    throw new AppError(502, 'REAP_COMPLETION_INCOMPLETE', 'Reap no confirmó pedido e importe');
  }
  const finalAmount = final ? reapMoney(final) : null;
  const mismatch = finalAmount ? !sameMoney(finalAmount, grant.quote.amount) : false;
  return transaction(async (sql) => {
    const locked = await sql.query<IntentRow>('SELECT * FROM payment_intents WHERE id=$1 FOR UPDATE', [row.id]);
    if (['COMPLETED','FAILED','EXPIRED'].includes(locked.rows[0].status)) return view(locked.rows[0]);
    if (checkout.status === 'COMPLETED') await completeGrant(sql, row.grant_id, row.id);
    if (checkout.status === 'FAILED' || checkout.status === 'EXPIRED') await releaseVerifiedFailure(sql, row.grant_id, row.id);
    const updated = await sql.query<IntentRow>(`UPDATE payment_intents SET status=$2,checkout_id=$3,order_id=$4,final_amount=$5,
      next_action_url=$6,amount_mismatch=$7,leased_until=NULL,next_poll_at=now()+interval '5 seconds',updated_at=now()
      WHERE id=$1 RETURNING *`, [row.id, checkout.status, checkout.id, checkout.orderId ?? null, finalAmount,
        checkout.nextAction?.url ?? null, mismatch]);
    await sql.query(`INSERT INTO payment_status_events(id,payment_intent_id,status,checkout_id,order_id,final_amount)
      VALUES($1,$2,$3,$4,$5,$6)`, [randomUUID(), row.id, checkout.status, checkout.id, checkout.orderId ?? null, finalAmount]);
    if (checkout.status === 'PROCESSING' || checkout.status === 'REQUIRES_ACTION') {
      await sql.query("UPDATE cases SET status=$2,updated_at=now() WHERE id=$1 AND status!='COMPLETED'", [row.case_id,
        checkout.status === 'PROCESSING' ? 'PROCESSING' : 'REAP_ACTION_REQUIRED']);
    }
    return view(updated.rows[0]);
  });
}

export async function submitIntent(id: string, client = new ReapClient()): Promise<PaymentOutcome> {
  const found = await database().query<IntentRow>('SELECT * FROM payment_intents WHERE id=$1', [id]);
  const row = found.rows[0];
  if (!row) throw new AppError(404, 'INTENT_NOT_FOUND', 'Intención no encontrada');
  if (row.checkout_id) return refreshPayment(id, client);
  if (row.status === 'COMPLETED' || row.status === 'FAILED' || row.status === 'EXPIRED') return view(row);
  if (Date.now() - row.created_at.getTime() >= 23 * 60 * 60 * 1_000) throw new AppError(409, 'REAP_RESULT_UNKNOWN', 'Es necesario resolver el cargo incierto con Reap');
  try { await verifyEvidence(row.evidence_id, row.id); }
  catch (error) {
    if (row.attempts === 0) {
      await transaction(async (sql) => {
        await releaseVerifiedFailure(sql, row.grant_id, id);
        await sql.query("UPDATE payment_intents SET status='FAILED',last_error_code='PRE_SUBMISSION_CHECK_FAILED' WHERE id=$1", [id]);
      });
    }
    throw error;
  }
  await database().query(`UPDATE payment_intents SET status='SUBMITTING',attempts=attempts+1,
    leased_until=now()+interval '30 seconds',updated_at=now() WHERE id=$1`, [id]);
  try {
    const checkout = await client.createCheckout({ ...row.request_body, idempotencyKey: row.idempotency_key });
    return persistCheckout(row, checkout.status === 'COMPLETED' ? await client.getCheckout(checkout.id) : checkout);
  } catch (error) {
    await database().query(`UPDATE payment_intents SET status='UNKNOWN',leased_until=NULL,
      next_poll_at=now()+interval '30 seconds',last_error_code=$2,updated_at=now() WHERE id=$1`,
      [id, error instanceof AppError ? error.code : 'REAP_RESULT_UNKNOWN']);
    await database().query(`UPDATE cases SET status='UNKNOWN',updated_at=now() WHERE id=$1`, [row.case_id]);
    throw error;
  }
}

export async function refreshPayment(id: string, client = new ReapClient()): Promise<PaymentOutcome> {
  const found = await database().query<IntentRow>('SELECT * FROM payment_intents WHERE id=$1', [id]);
  const row = found.rows[0];
  if (!row) throw new AppError(404, 'INTENT_NOT_FOUND', 'Intención no encontrada');
  if (!row.checkout_id || ['COMPLETED','FAILED','EXPIRED'].includes(row.status)) return view(row);
  const checkout = await client.getCheckout(row.checkout_id);
  return persistCheckout(row, checkout);
}

export async function getPayment(id: string): Promise<PaymentOutcome> {
  const found = await database().query<IntentRow>('SELECT * FROM payment_intents WHERE id=$1', [id]);
  if (!found.rows[0]) throw new AppError(404, 'INTENT_NOT_FOUND', 'Intención no encontrada');
  return view(found.rows[0]);
}

export async function latestPayment(caseId: string): Promise<PaymentOutcome | null> {
  const found = await database().query<IntentRow>('SELECT * FROM payment_intents WHERE case_id=$1 ORDER BY created_at DESC LIMIT 1', [caseId]);
  return found.rows[0] ? view(found.rows[0]) : null;
}

export async function findPaymentByReturnState(id: string, state: string): Promise<PaymentOutcome> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new AppError(400, 'INVALID_RETURN_STATE', 'Retorno inválido');
  const found = await database().query<IntentRow>('SELECT * FROM payment_intents WHERE id=$1 AND return_state_hash=$2', [id, stateHash(state)]);
  if (!found.rows[0]) throw new AppError(404, 'INVALID_RETURN_STATE', 'Retorno desconocido');
  return view(found.rows[0]);
}

export async function processOnePayment(client = new ReapClient()): Promise<boolean> {
  const claim = await transaction(async (sql) => {
    const found = await sql.query<IntentRow>(`SELECT * FROM payment_intents WHERE status IN
      ('RESERVED','SUBMITTING','UNKNOWN','REQUIRES_ACTION','PROCESSING') AND next_poll_at<=now()
      AND (leased_until IS NULL OR leased_until<now()) ORDER BY next_poll_at,created_at
      FOR UPDATE SKIP LOCKED LIMIT 1`);
    if (!found.rows[0]) return null;
    await sql.query("UPDATE payment_intents SET leased_until=now()+interval '30 seconds' WHERE id=$1", [found.rows[0].id]);
    return found.rows[0];
  });
  if (!claim) return false;
  try {
    if (claim.checkout_id) await refreshPayment(claim.id, client);
    else if (claim.attempts < 5) await submitIntent(claim.id, client);
    else await database().query("UPDATE payment_intents SET status='UNKNOWN',next_poll_at=now()+interval '15 minutes' WHERE id=$1", [claim.id]);
  } catch {
    await database().query("UPDATE payment_intents SET leased_until=NULL,next_poll_at=now()+interval '30 seconds' WHERE id=$1", [claim.id]);
  }
  return true;
}
