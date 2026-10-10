import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { canonicalHash } from '@/shared/canonical-json';
import { database } from '@/shared/database';
import { AppError } from '@/shared/errors';
import { parseMinor, sameMoney } from '@/shared/money';
import { getPurchaseAuthorization, getPaymentGrant } from '@/modules/authorization/service';
import { getDocumentVersion } from '@/modules/documents/repository';
import { getPurchasePlan } from '@/modules/reap-payments/plans';
import { loadKeyring } from './keys';
import { checkoutHash, issueDelegatedMandate, issueOpenMandate, verifyDelegatedMandate, type MandateContent } from './profile';

const profile = 'ap2-0.2-dsdjwt-00-demo-v1' as const;
const hash = (text: string) => createHash('sha256').update(text).digest('base64url');
const seconds = () => Math.floor(Date.now() / 1000);
const safeMinor = (value: string): number => {
  const parsed = parseMinor(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new AppError(422, 'AP2_AMOUNT_TOO_LARGE', 'Importe fuera del rango AP2 de la demo');
  return Number(parsed);
};

interface DelegationRow { id: string; authorization_id: string; checkout_open: string; payment_open: string }
interface EvidenceRow { id: string; grant_id: string; quote_id: string; checkout_jwt: string; checkout_credential: string;
  payment_credential: string; checkout_hash: string; nonce: string; created_at: Date }
export interface EvidenceBundle { id: string; profile: typeof profile; grantId: string; quoteId: string; checkoutCredential: string;
  paymentCredential: string; checkoutHash: string; verificationReceipt: string | null }

async function delegation(authorizationId: string): Promise<DelegationRow> {
  const found = await database().query<DelegationRow>('SELECT * FROM ap2_delegations WHERE authorization_id=$1', [authorizationId]);
  if (!found.rows[0]) throw new AppError(404, 'AP2_DELEGATION_NOT_FOUND', 'Falta la delegación AP2');
  return found.rows[0];
}

export async function prepareDelegation(authorizationId: string): Promise<void> {
  const existing = await database().query('SELECT 1 FROM ap2_delegations WHERE authorization_id=$1', [authorizationId]);
  if (existing.rows[0]) return;
  const authorization = await getPurchaseAuthorization(authorizationId);
  if (authorization.state !== 'ACTIVE' || Date.parse(authorization.expiresAt) <= Date.now()) throw new AppError(409, 'PO_AUTH_EXPIRED', 'La autorización venció');
  const row = await database().query<{ plan_id: string }>('SELECT plan_id FROM purchase_authorizations WHERE id=$1', [authorizationId]);
  const plan = await getPurchasePlan(row.rows[0].plan_id);
  if (plan.hash !== authorization.purchasePlanHash || canonicalHash(plan.po) !== canonicalHash(authorization.po)) throw new AppError(409, 'PLAN_CHANGED', 'El plan autorizado cambió');
  const keys = await loadKeyring();
  const iat = seconds();
  const exp = Math.floor(Date.parse(authorization.expiresAt) / 1000);
  const merchant = { name: 'Acteck', website: plan.merchantWebsite };
  const common = { iat, exp, cnf: { jwk: keys['demo-agent'].jwk },
    popayments: { version: 1, authorizationId, po: authorization.po, planHash: plan.hash, maxCharges: 1 } };
  const checkoutOpen = await issueOpenMandate({ ...common, vct: 'mandate.checkout.open.1', constraints: [
    { type: 'checkout.allowed_merchants', allowed: [merchant] },
    { type: 'checkout.line_items', items: plan.selections.map((item) => ({ id: item.sku,
      acceptable_items: [{ id: item.variantId, title: item.sku }], quantity: item.quantity })) },
  ] }, keys);
  const paymentOpen = await issueOpenMandate({ ...common, vct: 'mandate.payment.open.1', constraints: [
    { type: 'payment.allowed_payees', allowed: [merchant] },
    { type: 'payment.allowed_payment_instruments', allowed: [{ id: authorization.enrollmentId, type: 'card' }] },
    { type: 'payment.amount_range', currency: authorization.currency, max: safeMinor(authorization.maxMinorUnits) },
    { type: 'payment.reference', conditional_transaction_id: hash(checkoutOpen) },
  ] }, keys);
  await database().query(`INSERT INTO ap2_delegations(id,authorization_id,checkout_open,payment_open)
    VALUES($1,$2,$3,$4) ON CONFLICT(authorization_id) DO NOTHING`, [randomUUID(), authorizationId, checkoutOpen, paymentOpen]);
}

export async function bindEvidence(grantId: string): Promise<EvidenceBundle> {
  const prior = await database().query<EvidenceRow>('SELECT * FROM ap2_evidence WHERE grant_id=$1', [grantId]);
  if (prior.rows[0]) return getEvidence(prior.rows[0].id);
  const grant = await getPaymentGrant(grantId);
  if (grant.state !== 'AVAILABLE' || Date.parse(grant.expiresAt) <= Date.now()) throw new AppError(409, 'GRANT_NOT_AVAILABLE', 'El permiso no está disponible');
  const authorization = await getPurchaseAuthorization(grant.authorizationId);
  if (authorization.state !== 'ACTIVE' || Date.parse(authorization.expiresAt) <= Date.now()) throw new AppError(409, 'PO_AUTH_EXPIRED', 'La autorización venció');
  await prepareDelegation(grant.authorizationId);
  const opens = await delegation(grant.authorizationId);
  const keys = await loadKeyring();
  const iat = seconds();
  const exp = Math.min(Math.floor(Date.parse(grant.expiresAt) / 1000), iat + 300);
  const nonce = randomBytes(24).toString('base64url');
  const quote = grant.quote;
  const planRow = await database().query<{ plan_id: string }>('SELECT plan_id FROM purchase_authorizations WHERE id=$1', [grant.authorizationId]);
  const plan = await getPurchasePlan(planRow.rows[0].plan_id);
  const checkoutJwt = await new SignJWT({ iss: 'demo-merchant-proxy', merchant: { name: 'Acteck', website: quote.merchantWebsite },
    quoteId: quote.quoteId, planHash: plan.hash, termsHash: quote.termsHash, items: plan.selections,
    amount: quote.amount, iat, exp })
    .setProtectedHeader({ alg: 'ES256', typ: 'checkout+jwt', kid: 'demo-merchant-proxy' })
    .sign(keys['demo-merchant-proxy'].privateKey);
  const digest = checkoutHash(checkoutJwt);
  const extension = { version: 1, grantId, authorizationId: grant.authorizationId, decisionId: grant.decisionId,
    reconciliationId: grant.reconciliationId, po: grant.po, invoice: grant.invoice, quoteId: quote.quoteId,
    planHash: plan.hash, termsHash: quote.termsHash };
  const checkoutClosed: MandateContent = { vct: 'mandate.checkout.1', iat, exp, checkout_jwt: checkoutJwt,
    checkout_hash: digest, popayments: extension };
  const paymentClosed: MandateContent = { vct: 'mandate.payment.1', iat, exp, transaction_id: digest,
    payee: { name: 'Acteck', website: quote.merchantWebsite },
    payment_amount: { currency: quote.amount.currency, amount: safeMinor(quote.amount.minorUnits) },
    payment_instrument: { id: grant.enrollmentId, type: 'card' }, popayments: extension };
  const checkoutCredential = await issueDelegatedMandate(opens.checkout_open, checkoutClosed, 'demo-verifier', nonce, keys);
  const paymentCredential = await issueDelegatedMandate(opens.payment_open, paymentClosed, 'demo-verifier', nonce, keys);
  const inserted = await database().query<EvidenceRow>(`INSERT INTO ap2_evidence
    (id,grant_id,quote_id,checkout_jwt,checkout_credential,payment_credential,checkout_hash,nonce)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(grant_id) DO NOTHING RETURNING *`,
    [randomUUID(), grantId, quote.quoteId, checkoutJwt, checkoutCredential, paymentCredential, digest, nonce]);
  const row = inserted.rows[0] ?? (await database().query<EvidenceRow>('SELECT * FROM ap2_evidence WHERE grant_id=$1', [grantId])).rows[0];
  await verifyEvidence(row.id);
  return getEvidence(row.id);
}

export async function verifyEvidence(id: string, intentId?: string): Promise<{ valid: true; receipt: string }> {
  const found = await database().query<EvidenceRow>('SELECT * FROM ap2_evidence WHERE id=$1', [id]);
  const row = found.rows[0];
  if (!row) throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'Evidencia no encontrada');
  const [grant, keys] = await Promise.all([getPaymentGrant(row.grant_id), loadKeyring()]);
  const reserved = await database().query<{ reserved_intent_id: string | null }>('SELECT reserved_intent_id FROM payment_grants WHERE id=$1', [grant.id]);
  if (!(grant.state === 'AVAILABLE' || (grant.state === 'RESERVED' && intentId && reserved.rows[0].reserved_intent_id === intentId))) {
    throw new AppError(409, 'GRANT_NOT_AVAILABLE', 'El permiso no está disponible para esta intención');
  }
  if (Date.parse(grant.expiresAt) <= Date.now()) throw new AppError(409, 'GRANT_EXPIRED', 'El permiso venció');
  const [checkout, payment] = await Promise.all([
    verifyDelegatedMandate(row.checkout_credential, 'mandate.checkout.1', 'demo-verifier', row.nonce, keys),
    verifyDelegatedMandate(row.payment_credential, 'mandate.payment.1', 'demo-verifier', row.nonce, keys),
  ]);
  const checkoutClosed = checkout.closed;
  const paymentClosed = payment.closed;
  const { payload: merchantPayload, protectedHeader } = await jwtVerify(row.checkout_jwt, keys['demo-merchant-proxy'].publicKey,
    { algorithms: ['ES256'], issuer: 'demo-merchant-proxy' });
  if (protectedHeader.kid !== 'demo-merchant-proxy' || protectedHeader.typ !== 'checkout+jwt') throw new AppError(422, 'INVALID_CHECKOUT_SIGNATURE', 'Firma de compra inválida');
  const expectedHash = checkoutHash(row.checkout_jwt);
  if (row.checkout_hash !== expectedHash || checkoutClosed.checkout_hash !== expectedHash || paymentClosed.transaction_id !== expectedHash ||
      checkoutClosed.checkout_jwt !== row.checkout_jwt || row.quote_id !== grant.quote.quoteId) {
    throw new AppError(422, 'AP2_HASH_MISMATCH', 'El checkout no corresponde al pago');
  }
  const extension = { version: 1, grantId: grant.id, authorizationId: grant.authorizationId, decisionId: grant.decisionId,
    reconciliationId: grant.reconciliationId, po: grant.po, invoice: grant.invoice, quoteId: grant.quote.quoteId,
    planHash: grant.quote.purchasePlanHash, termsHash: grant.quote.termsHash };
  if (canonicalHash(checkoutClosed.popayments) !== canonicalHash(extension) || canonicalHash(paymentClosed.popayments) !== canonicalHash(extension)) {
    throw new AppError(422, 'AP2_REFERENCE_MISMATCH', 'La evidencia usa otras referencias');
  }
  const authorization = await getPurchaseAuthorization(grant.authorizationId);
  if (authorization.state !== 'ACTIVE' || Date.parse(authorization.expiresAt) <= Date.now() ||
      canonicalHash(authorization.po) !== canonicalHash(grant.po) || authorization.purchasePlanHash !== grant.quote.purchasePlanHash) {
    throw new AppError(409, 'PO_AUTH_EXPIRED', 'La autorización de compra cambió');
  }
  const planRow = await database().query<{ plan_id: string }>('SELECT plan_id FROM purchase_authorizations WHERE id=$1', [grant.authorizationId]);
  const plan = await getPurchasePlan(planRow.rows[0].plan_id);
  const expectedMerchant = { name: 'Acteck', website: grant.quote.merchantWebsite };
  const allowedMerchant = (checkout.open.constraints as Record<string, unknown>[] | undefined)?.find((value) => value.type === 'checkout.allowed_merchants');
  const allowedPayee = (payment.open.constraints as Record<string, unknown>[] | undefined)?.find((value) => value.type === 'payment.allowed_payees');
  const allowedInstrument = (payment.open.constraints as Record<string, unknown>[] | undefined)?.find((value) => value.type === 'payment.allowed_payment_instruments');
  const amountRange = (payment.open.constraints as Record<string, unknown>[] | undefined)?.find((value) => value.type === 'payment.amount_range');
  const reference = (payment.open.constraints as Record<string, unknown>[] | undefined)?.find((value) => value.type === 'payment.reference');
  const lineItems = (checkout.open.constraints as Record<string, unknown>[] | undefined)?.find((value) => value.type === 'checkout.line_items');
  const expectedItems = plan.selections.map((item) => ({ id: item.sku, acceptable_items: [{ id: item.variantId, title: item.sku }], quantity: item.quantity }));
  const checks: [string, boolean][] = [
    ['MERCHANT', canonicalHash(allowedMerchant?.allowed) === canonicalHash([expectedMerchant])],
    ['PAYEE', canonicalHash(allowedPayee?.allowed) === canonicalHash([expectedMerchant])],
    ['INSTRUMENT', canonicalHash(allowedInstrument?.allowed) === canonicalHash([{ id: grant.enrollmentId, type: 'card' }])],
    ['ITEMS', canonicalHash(lineItems?.items) === canonicalHash(expectedItems)],
    ['LIMIT', amountRange?.currency === grant.quote.amount.currency && amountRange?.max === safeMinor(authorization.maxMinorUnits)],
    ['REFERENCE', reference?.conditional_transaction_id === hash(row.checkout_credential.split('~~')[0] + '~')],
    ['CLOSED_PAYEE', canonicalHash(paymentClosed.payee) === canonicalHash(expectedMerchant)],
    ['CLOSED_INSTRUMENT', canonicalHash(paymentClosed.payment_instrument) === canonicalHash({ id: grant.enrollmentId, type: 'card' })],
    ['CLOSED_AMOUNT', canonicalHash(paymentClosed.payment_amount) === canonicalHash({ currency: grant.quote.amount.currency, amount: safeMinor(grant.quote.amount.minorUnits) })],
    ['CHECKOUT_MERCHANT', canonicalHash(merchantPayload.merchant) === canonicalHash(expectedMerchant)],
    ['CHECKOUT_QUOTE', merchantPayload.quoteId === grant.quote.quoteId && merchantPayload.planHash === plan.hash && merchantPayload.termsHash === grant.quote.termsHash],
    ['CHECKOUT_ITEMS', canonicalHash(merchantPayload.items) === canonicalHash(plan.selections)],
    ['CHECKOUT_AMOUNT', sameMoney(merchantPayload.amount as typeof grant.quote.amount, grant.quote.amount)],
  ];
  const failed = checks.find(([, matched]) => !matched);
  if (failed) throw new AppError(422, `AP2_${failed[0]}_MISMATCH`, `La compra excede las restricciones AP2: ${failed[0]}`);
  for (const ref of [grant.po, grant.invoice]) {
    const stored = await getDocumentVersion(ref.documentId);
    if (!stored || stored.version !== ref.version || stored.sourceHash !== ref.sourceHash || stored.canonicalHash !== ref.canonicalHash) {
      throw new AppError(409, 'DOCUMENT_CHANGED', 'Un documento cambió');
    }
  }
  const receipt = await new SignJWT({ iss: 'demo-verifier', iat: seconds(), status: 'Success',
    reference: hash(row.payment_credential), evidenceId: id, profile })
    .setProtectedHeader({ alg: 'ES256', typ: 'ap2-receipt+jwt', kid: 'demo-verifier' })
    .sign(keys['demo-verifier'].privateKey);
  await database().query('INSERT INTO ap2_verification_receipts(id,evidence_id,token) VALUES($1,$2,$3)', [randomUUID(), id, receipt]);
  return { valid: true, receipt };
}

export async function getEvidence(id: string): Promise<EvidenceBundle> {
  const found = await database().query<EvidenceRow>('SELECT * FROM ap2_evidence WHERE id=$1', [id]);
  const row = found.rows[0];
  if (!row) throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'Evidencia no encontrada');
  const latest = await database().query<{ token: string }>('SELECT token FROM ap2_verification_receipts WHERE evidence_id=$1 ORDER BY verified_at DESC LIMIT 1', [id]);
  return { id: row.id, profile, grantId: row.grant_id, quoteId: row.quote_id, checkoutCredential: row.checkout_credential,
    paymentCredential: row.payment_credential, checkoutHash: row.checkout_hash, verificationReceipt: latest.rows[0]?.token ?? null };
}

export async function latestEvidence(caseId: string): Promise<{ id: string; checkoutHash: string; grantId: string } | null> {
  const found = await database().query<EvidenceRow>(`SELECT e.* FROM ap2_evidence e JOIN payment_grants g ON g.id=e.grant_id
    WHERE g.case_id=$1 ORDER BY e.created_at DESC LIMIT 1`, [caseId]);
  return found.rows[0] ? { id: found.rows[0].id, checkoutHash: found.rows[0].checkout_hash, grantId: found.rows[0].grant_id } : null;
}
