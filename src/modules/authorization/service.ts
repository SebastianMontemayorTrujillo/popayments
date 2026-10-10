import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { database, transaction } from '@/shared/database';
import { AppError } from '@/shared/errors';
import { canonicalHash } from '@/shared/canonical-json';
import { sameMoney } from '@/shared/money';
import type { DocumentRef } from '@/modules/documents/contracts';
import type { PaymentGrant, PurchaseAuthorization, QuoteSnapshot } from './contracts';
import { evaluateAutomaticGrant } from './policy';

interface AuthorizationRow {
  id: string; case_id: string; po_ref: DocumentRef; plan_id: string; plan_hash: string;
  merchant_id: string; enrollment_id: string; currency: 'MXN' | 'USD'; max_minor_units: string;
  actor_id: string; state: PurchaseAuthorization['state']; expires_at: Date;
}
interface GrantRow {
  id: string; case_id: string; authorization_id: string; decision_id: string | null;
  po_ref: DocumentRef; invoice_ref: DocumentRef; reconciliation_id: string; quote_snapshot: QuoteSnapshot;
  enrollment_id: string; expires_at: Date; state: PaymentGrant['state']; reserved_intent_id: string | null;
}
interface CaseRow { id: string; version: number; po_id: string | null; po_version: number | null; invoice_id: string | null; invoice_version: number | null; status: string }
interface ReconciliationRow { id: string; po_id: string; po_version: number; invoice_id: string; invoice_version: number; status: 'MATCHED' | 'MISMATCHED' }

function authorization(row: AuthorizationRow): PurchaseAuthorization {
  return { id: row.id, caseId: row.case_id, po: row.po_ref, actorId: row.actor_id, purchasePlanHash: row.plan_hash,
    merchantId: row.merchant_id, enrollmentId: row.enrollment_id, currency: row.currency, maxMinorUnits: row.max_minor_units,
    expiresAt: row.expires_at.toISOString(), state: row.state };
}
function grant(row: GrantRow): PaymentGrant {
  return { id: row.id, caseId: row.case_id, authorizationId: row.authorization_id, decisionId: row.decision_id,
    po: row.po_ref, invoice: row.invoice_ref, reconciliationId: row.reconciliation_id, quote: row.quote_snapshot,
    enrollmentId: row.enrollment_id, expiresAt: row.expires_at.toISOString(), state: row.state };
}
async function lockedCase(client: pg.PoolClient, caseId: string, expectedVersion?: number): Promise<CaseRow> {
  const found = await client.query<CaseRow>('SELECT id,version,po_id,po_version,invoice_id,invoice_version,status FROM cases WHERE id=$1 FOR UPDATE', [caseId]);
  const row = found.rows[0];
  if (!row) throw new AppError(404, 'CASE_NOT_FOUND', 'Caso no encontrado');
  if (expectedVersion !== undefined && row.version !== expectedVersion) throw new AppError(409, 'STALE_CASE', 'El caso cambió');
  if (['REJECTED','PAYING','PROCESSING','COMPLETED','UNKNOWN'].includes(row.status)) throw new AppError(409, 'CASE_CLOSED', 'El caso no admite otra decisión');
  return row;
}
async function versionRef(client: pg.PoolClient, id: string, version: number): Promise<DocumentRef> {
  const found = await client.query<{ source_hash: string; canonical_hash: string; current_version: number }>(
    `SELECT v.source_hash,v.canonical_hash,d.current_version FROM document_versions v
     JOIN documents d ON d.id=v.document_id WHERE v.document_id=$1 AND v.version=$2`, [id, version]);
  if (!found.rows[0] || found.rows[0].current_version !== version) throw new AppError(409, 'DOCUMENT_CHANGED', 'Existe una nueva versión del documento');
  return { documentId: id, version, sourceHash: found.rows[0].source_hash, canonicalHash: found.rows[0].canonical_hash };
}
async function latestAuthorization(client: pg.PoolClient, caseId: string): Promise<AuthorizationRow> {
  const found = await client.query<AuthorizationRow>(
    `SELECT * FROM purchase_authorizations WHERE case_id=$1 AND state='ACTIVE' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [caseId]);
  if (!found.rows[0] || found.rows[0].expires_at <= new Date()) throw new AppError(409, 'PO_AUTH_REQUIRED', 'La PO necesita una autorización vigente');
  return found.rows[0];
}

export async function approvePurchase(input: {
  caseId: string; expectedCaseVersion: number; po: DocumentRef;
  plan: { id: string; po: DocumentRef; hash: string; merchantId: string };
  enrollment: { id: string; status: 'ACTIVE' }; actorId: string;
}): Promise<PurchaseAuthorization> {
  const result = await transaction(async (client) => {
    const current = await lockedCase(client, input.caseId, input.expectedCaseVersion);
    if (!current.po_id || !current.po_version) throw new AppError(409, 'MISSING_PO', 'Falta la PO');
    const actualRef = await versionRef(client, current.po_id, current.po_version);
    if (canonicalHash(actualRef) !== canonicalHash(input.po) || canonicalHash(input.plan.po) !== canonicalHash(actualRef)) throw new AppError(409, 'PO_CHANGED', 'La PO del plan cambió');
    if (input.plan.merchantId !== 'acteck') throw new AppError(422, 'MERCHANT_NOT_ALLOWED', 'Solo se admiten compras a Acteck');
    if (input.enrollment.status !== 'ACTIVE') throw new AppError(409, 'ENROLLMENT_NOT_ACTIVE', 'La tarjeta aún no está lista');
    const doc = await client.query<{ data: { supplierId: string; total: { currency: 'MXN' | 'USD'; minorUnits: string } } }>(
      'SELECT data FROM document_versions WHERE document_id=$1 AND version=$2', [current.po_id, current.po_version]);
    if (doc.rows[0].data.supplierId !== 'acteck') throw new AppError(422, 'SUPPLIER_NOT_ALLOWED', 'La PO debe identificar a Acteck');
    if ((await client.query('SELECT 1 FROM payment_exclusions WHERE po_id=$1', [current.po_id])).rows[0]) throw new AppError(409, 'PAYMENT_STARTED', 'La PO ya tiene una intención de pago');
    await client.query(`UPDATE purchase_authorizations SET state='REVOKED' WHERE case_id=$1 AND state='ACTIVE'`, [input.caseId]);
    const id = randomUUID();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1_000);
    const saved = await client.query<AuthorizationRow>(`INSERT INTO purchase_authorizations
      (id,case_id,po_ref,plan_id,plan_hash,merchant_id,enrollment_id,currency,max_minor_units,actor_id,state,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',$11) RETURNING *`,
      [id, input.caseId, actualRef, input.plan.id, input.plan.hash, 'acteck', input.enrollment.id,
        doc.rows[0].data.total.currency, doc.rows[0].data.total.minorUnits, input.actorId, expires]);
    let nextStatus = 'WAITING_INVOICE';
    if (current.invoice_id && current.invoice_version) {
      const reconciled = await client.query<{ status: 'MATCHED' | 'MISMATCHED' }>(`SELECT status FROM reconciliations
        WHERE case_id=$1 AND po_id=$2 AND po_version=$3 AND invoice_id=$4 AND invoice_version=$5
        ORDER BY created_at DESC LIMIT 1`, [input.caseId, current.po_id, current.po_version, current.invoice_id, current.invoice_version]);
      nextStatus = reconciled.rows[0] ? (reconciled.rows[0].status === 'MATCHED' ? 'QUOTE_REVIEW_REQUIRED' : 'REVIEW_REQUIRED') : 'RECONCILING';
    }
    await client.query('UPDATE cases SET status=$2,version=version+1,updated_at=now() WHERE id=$1', [input.caseId, nextStatus]);
    await client.query('INSERT INTO audit_events(id,actor_id,entity_type,entity_id,action,details) VALUES($1,$2,$3,$4,$5,$6)',
      [randomUUID(), input.actorId, 'po_authorization', id, 'APPROVE_PO', { po: actualRef, planHash: input.plan.hash }]);
    return saved.rows[0];
  });
  return authorization(result);
}

export async function recordReview(caseId: string, reconciliationId: string, expectedVersion: number, actorId: string): Promise<string> {
  return transaction(async (client) => {
    const current = await lockedCase(client, caseId, expectedVersion);
    if (current.status !== 'REVIEW_REQUIRED') throw new AppError(409, 'REVIEW_NOT_REQUIRED', 'Este caso no tiene una discrepancia pendiente');
    const reconciliation = await client.query<ReconciliationRow>('SELECT * FROM reconciliations WHERE id=$1 AND case_id=$2', [reconciliationId, caseId]);
    if (reconciliation.rows[0]?.status !== 'MISMATCHED') throw new AppError(422, 'INVALID_RECONCILIATION', 'Se requiere una discrepancia vigente');
    const id = randomUUID();
    const added = await client.query<{ id: string }>(`INSERT INTO payment_reviews(id,case_id,reconciliation_id,actor_id)
      VALUES($1,$2,$3,$4) ON CONFLICT(case_id,reconciliation_id) DO NOTHING RETURNING id`, [id, caseId, reconciliationId, actorId]);
    if (!added.rows[0]) throw new AppError(409, 'ALREADY_REVIEWED', 'La factura ya fue revisada');
    await client.query('INSERT INTO audit_events(id,actor_id,entity_type,entity_id,action) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), actorId, 'payment_review', id, 'REVIEW_INVOICE']);
    return id;
  });
}

export async function getReviewForCase(caseId: string, reconciliationId: string | undefined): Promise<{ id: string; actorId: string; createdAt: string } | null> {
  if (!reconciliationId) return null;
  const found = await database().query<{ id: string; actor_id: string; created_at: Date }>(
    'SELECT id,actor_id,created_at FROM payment_reviews WHERE case_id=$1 AND reconciliation_id=$2', [caseId, reconciliationId]);
  const row = found.rows[0];
  return row ? { id: row.id, actorId: row.actor_id, createdAt: row.created_at.toISOString() } : null;
}

export async function rejectPayment(caseId: string, expectedVersion: number, actorId: string, justification: string): Promise<string> {
  return transaction(async (client) => {
    const current = await lockedCase(client, caseId, expectedVersion);
    if (current.po_id && (await client.query('SELECT 1 FROM payment_exclusions WHERE po_id=$1', [current.po_id])).rows[0]) {
      throw new AppError(409, 'PAYMENT_STARTED', 'Ya se inició un pago y no se puede prometer detenerlo');
    }
    const id = randomUUID();
    await client.query(`INSERT INTO payment_decisions(id,case_id,kind,justification,actor_id)
      VALUES($1,$2,'REJECT',$3,$4)`, [id, caseId, justification, actorId]);
    await client.query(`UPDATE cases SET status='REJECTED',version=version+1,updated_at=now() WHERE id=$1`, [caseId]);
    await client.query('INSERT INTO audit_events(id,actor_id,entity_type,entity_id,action,details) VALUES($1,$2,$3,$4,$5,$6)',
      [randomUUID(), actorId, 'payment_decision', id, 'REJECT', { justification }]);
    return id;
  });
}

export async function createPaymentGrant(input: {
  caseId: string; reconciliationId: string; quote: QuoteSnapshot;
  mode: 'AUTO' | 'AUTHORIZE_EXCEPTION' | 'AUTHORIZE_QUOTE_CHANGE';
  actorId?: string; justification?: string;
}): Promise<PaymentGrant> {
  const saved = await transaction(async (client) => {
    const current = await lockedCase(client, input.caseId);
    if (!current.po_id || !current.po_version || !current.invoice_id || !current.invoice_version) throw new AppError(409, 'MISSING_DOCUMENTS', 'Faltan documentos');
    const po = await versionRef(client, current.po_id, current.po_version);
    const invoice = await versionRef(client, current.invoice_id, current.invoice_version);
    const reconciliation = (await client.query<ReconciliationRow>('SELECT * FROM reconciliations WHERE id=$1 AND case_id=$2', [input.reconciliationId, input.caseId])).rows[0];
    if (!reconciliation || reconciliation.po_id !== po.documentId || reconciliation.po_version !== po.version || reconciliation.invoice_id !== invoice.documentId || reconciliation.invoice_version !== invoice.version) {
      throw new AppError(409, 'STALE_RECONCILIATION', 'La conciliación cambió');
    }
    const auth = await latestAuthorization(client, input.caseId);
    if (canonicalHash(auth.po_ref) !== canonicalHash(po)) throw new AppError(409, 'PO_CHANGED', 'La autorización de PO está obsoleta');
    const invoiceData = (await client.query<{ data: { total: QuoteSnapshot['amount'] } }>('SELECT data FROM document_versions WHERE document_id=$1 AND version=$2', [invoice.documentId, invoice.version])).rows[0].data;
    if (input.quote.merchantId !== 'acteck' || input.quote.merchantId !== auth.merchant_id || input.quote.purchasePlanHash !== auth.plan_hash) throw new AppError(422, 'TERMS_CHANGED', 'Merchant o plan no autorizado');
    if (new Date(input.quote.expiresAt) <= new Date()) throw new AppError(409, 'QUOTE_EXPIRED', 'La cotización venció');
    let decisionId: string | null = null;
    let effectiveAuth = auth;
    if (input.mode === 'AUTO') {
      const result = evaluateAutomaticGrant({ authorization: authorization(auth), po, invoice, invoiceTotal: invoiceData.total,
        reconciliationStatus: reconciliation.status, quote: input.quote, now: new Date().toISOString() });
      if (!result.allowed) throw new AppError(409, result.reason, 'Se requiere revisar las condiciones del pago');
    } else {
      const justification = input.justification?.trim() ?? '';
      if (!input.actorId || justification.length < 10 || justification.length > 1000) throw new AppError(422, 'JUSTIFICATION_REQUIRED', 'Escribe una justificación de 10 a 1000 caracteres');
      if (input.mode === 'AUTHORIZE_EXCEPTION') {
        if (reconciliation.status !== 'MISMATCHED') throw new AppError(409, 'NOT_AN_EXCEPTION', 'Los documentos coinciden');
        const reviewed = await client.query('SELECT 1 FROM payment_reviews WHERE case_id=$1 AND reconciliation_id=$2', [input.caseId, input.reconciliationId]);
        if (!reviewed.rows[0]) throw new AppError(409, 'REVIEW_REQUIRED', 'Primero marca la factura como revisada');
        if (!sameMoney(input.quote.amount, invoiceData.total)) throw new AppError(422, 'INVOICE_TERMS_CHANGED', 'La cotización debe corresponder a la factura aceptada');
      } else {
        if (reconciliation.status !== 'MATCHED') throw new AppError(409, 'EXCEPTION_REQUIRED', 'La factura discrepante exige una excepción');
        if (input.quote.amount.currency !== auth.currency) throw new AppError(422, 'CURRENCY_CHANGED', 'El cambio de moneda requiere una excepción documental');
      }
      decisionId = randomUUID();
      await client.query(`INSERT INTO payment_decisions(id,case_id,kind,reconciliation_id,quote_id,terms_hash,justification,actor_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [decisionId, input.caseId, input.mode, input.reconciliationId, input.quote.quoteId, input.quote.termsHash, justification, input.actorId]);
      await client.query('INSERT INTO audit_events(id,actor_id,entity_type,entity_id,action,details) VALUES($1,$2,$3,$4,$5,$6)',
        [randomUUID(), input.actorId, 'payment_decision', decisionId, input.mode, { quote: input.quote, reconciliationId: input.reconciliationId, justification }]);
      await client.query("UPDATE purchase_authorizations SET state='REVOKED' WHERE id=$1", [auth.id]);
      const replacement = await client.query<AuthorizationRow>(`INSERT INTO purchase_authorizations
        (id,case_id,po_ref,plan_id,plan_hash,merchant_id,enrollment_id,currency,max_minor_units,actor_id,state,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',$11) RETURNING *`,
        [randomUUID(), input.caseId, po, auth.plan_id, auth.plan_hash, auth.merchant_id, auth.enrollment_id,
          input.quote.amount.currency, input.quote.amount.minorUnits, input.actorId, auth.expires_at]);
      effectiveAuth = replacement.rows[0];
    }
    if ((await client.query('SELECT 1 FROM payment_exclusions WHERE po_id=$1', [po.documentId])).rows[0]) throw new AppError(409, 'PAYMENT_STARTED', 'La PO ya tiene una intención de pago');
    const id = randomUUID();
    const expiresAt = new Date(Math.min(effectiveAuth.expires_at.getTime(), new Date(input.quote.expiresAt).getTime()));
    const inserted = await client.query<GrantRow>(`INSERT INTO payment_grants
      (id,case_id,authorization_id,decision_id,po_ref,invoice_ref,reconciliation_id,quote_id,quote_snapshot,enrollment_id,expires_at,state)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'AVAILABLE') ON CONFLICT DO NOTHING RETURNING *`,
      [id, input.caseId, effectiveAuth.id, decisionId, po, invoice, input.reconciliationId, input.quote.quoteId, input.quote, effectiveAuth.enrollment_id, expiresAt]);
    if (!inserted.rows[0]) throw new AppError(409, 'GRANT_ALREADY_EXISTS', 'Ya existe un permiso para esta cotización');
    await client.query(`UPDATE cases SET status='READY_FOR_PAYMENT',version=version+1,updated_at=now() WHERE id=$1`, [input.caseId]);
    return inserted.rows[0];
  });
  return grant(saved);
}

export async function getPaymentGrant(id: string): Promise<PaymentGrant> {
  const found = await database().query<GrantRow>('SELECT * FROM payment_grants WHERE id=$1', [id]);
  if (!found.rows[0]) throw new AppError(404, 'GRANT_NOT_FOUND', 'Permiso no encontrado');
  return grant(found.rows[0]);
}

export async function latestPurchaseAuthorization(caseId: string): Promise<PurchaseAuthorization | null> {
  const found = await database().query<AuthorizationRow>('SELECT * FROM purchase_authorizations WHERE case_id=$1 ORDER BY created_at DESC LIMIT 1', [caseId]);
  return found.rows[0] ? authorization(found.rows[0]) : null;
}

export async function getPurchaseAuthorization(id: string): Promise<PurchaseAuthorization> {
  const found = await database().query<AuthorizationRow>('SELECT * FROM purchase_authorizations WHERE id=$1', [id]);
  if (!found.rows[0]) throw new AppError(404, 'PO_AUTH_NOT_FOUND', 'Autorización de PO no encontrada');
  return authorization(found.rows[0]);
}

export async function latestPaymentGrant(caseId: string): Promise<PaymentGrant | null> {
  const found = await database().query<GrantRow>('SELECT * FROM payment_grants WHERE case_id=$1 ORDER BY created_at DESC LIMIT 1', [caseId]);
  return found.rows[0] ? grant(found.rows[0]) : null;
}

export async function reserveGrant(client: pg.PoolClient, grantId: string, intentId: string): Promise<PaymentGrant> {
  const found = await client.query<GrantRow>('SELECT * FROM payment_grants WHERE id=$1 FOR UPDATE', [grantId]);
  const row = found.rows[0];
  if (!row) throw new AppError(404, 'GRANT_NOT_FOUND', 'Permiso no encontrado');
  if (row.state === 'RESERVED' && row.reserved_intent_id === intentId) return grant(row);
  if (row.state !== 'AVAILABLE' || row.expires_at <= new Date()) throw new AppError(409, 'GRANT_NOT_AVAILABLE', 'El permiso ya no está disponible');
  const auth = await client.query<AuthorizationRow>('SELECT * FROM purchase_authorizations WHERE id=$1', [row.authorization_id]);
  if (auth.rows[0]?.state !== 'ACTIVE' || auth.rows[0].expires_at <= new Date()) throw new AppError(409, 'PO_AUTH_EXPIRED', 'La autorización de PO venció');
  for (const ref of [row.po_ref, row.invoice_ref]) await versionRef(client, ref.documentId, ref.version);
  const inserted = await client.query(`INSERT INTO payment_exclusions(po_id,invoice_id,payment_intent_id,state)
    VALUES($1,$2,$3,'RESERVED') ON CONFLICT DO NOTHING RETURNING po_id`, [row.po_ref.documentId, row.invoice_ref.documentId, intentId]);
  if (!inserted.rows[0]) throw new AppError(409, 'PAYMENT_STARTED', 'La PO ya tiene una intención de pago');
  const updated = await client.query<GrantRow>(`UPDATE payment_grants SET state='RESERVED',reserved_intent_id=$2 WHERE id=$1 RETURNING *`, [grantId, intentId]);
  await client.query(`UPDATE cases SET status='PAYING',version=version+1,updated_at=now() WHERE id=$1`, [row.case_id]);
  return grant(updated.rows[0]);
}

export async function completeGrant(client: pg.PoolClient, grantId: string, intentId: string): Promise<void> {
    const found = await client.query<GrantRow>('SELECT * FROM payment_grants WHERE id=$1 FOR UPDATE', [grantId]);
    const row = found.rows[0];
    if (!row || row.reserved_intent_id !== intentId) throw new AppError(409, 'INTENT_MISMATCH', 'La intención no corresponde al permiso');
    await client.query(`UPDATE payment_grants SET state='CONSUMED' WHERE id=$1`, [grantId]);
    await client.query(`UPDATE payment_exclusions SET state='COMPLETED' WHERE po_id=$1 AND payment_intent_id=$2`, [row.po_ref.documentId, intentId]);
    await client.query(`UPDATE cases SET status='COMPLETED',version=version+1,updated_at=now() WHERE id=$1`, [row.case_id]);
}

export async function releaseVerifiedFailure(client: pg.PoolClient, grantId: string, intentId: string): Promise<void> {
    const found = await client.query<GrantRow>('SELECT * FROM payment_grants WHERE id=$1 FOR UPDATE', [grantId]);
    const row = found.rows[0];
    if (!row || row.reserved_intent_id !== intentId) throw new AppError(409, 'INTENT_MISMATCH', 'La intención no corresponde al permiso');
    await client.query('DELETE FROM payment_exclusions WHERE po_id=$1 AND payment_intent_id=$2 AND state=$3', [row.po_ref.documentId, intentId, 'RESERVED']);
    await client.query(`UPDATE payment_grants SET state='REVOKED' WHERE id=$1`, [grantId]);
    await client.query(`UPDATE cases SET status='FAILED',version=version+1,updated_at=now() WHERE id=$1`, [row.case_id]);
}
