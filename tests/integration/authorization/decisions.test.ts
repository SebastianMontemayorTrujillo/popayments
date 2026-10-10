import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { database } from '../../../src/shared/database';
import { parseDocument } from '../../../src/modules/documents/parse';
import { createDocument } from '../../../src/modules/documents/repository';
import { createCase, linkDocument } from '../../../src/modules/payment-workflow/cases';
import { reconcileCase } from '../../../src/modules/reconciliation/service';
import { approvePurchase, createPaymentGrant, getPaymentGrant, recordReview, reserveGrant } from '../../../src/modules/authorization/service';
import { bindEvidence, verifyEvidence } from '../../../src/modules/ap2-evidence/service';
import { initializeDemoKeys } from '../../../src/modules/ap2-evidence/keys';
import { ReapClient } from '../../../src/modules/reap-payments/client';
import { executePayment, refreshPayment } from '../../../src/modules/reap-payments/payments';
import { canonicalHash } from '../../../src/shared/canonical-json';

const actorId = randomUUID();
const number = `PO-${randomUUID()}`;
let caseId = '';
const documentIds: string[] = [];
const planId = randomUUID();

function document(kind: 'PO' | 'INVOICE', reference: string) {
  return Buffer.from(JSON.stringify({
    schemaVersion: '1', kind, documentNumber: kind === 'PO' ? number : `F-${randomUUID()}`,
    poReference: reference, supplierId: 'acteck', supplierName: 'Acteck', issuedAt: '2026-10-09',
    total: { currency: 'MXN', minorUnits: '116000' },
    items: kind === 'PO' ? [{ sku: 'DEMO', description: 'Equipo', quantity: 1, unitPriceMinorUnits: '116000' }] : [],
  }));
}

describe.runIf(Boolean(process.env.DATABASE_URL))('autorización y exclusión de pago', () => {
  beforeAll(async () => {
    await initializeDemoKeys();
    await database().query('INSERT INTO demo_users(id,email,password_hash) VALUES($1,$2,$3)', [actorId, `${actorId}@example.test`, 'test-only']);
  });
  afterAll(async () => {
    if (caseId) {
      await database().query('DELETE FROM payment_status_events WHERE payment_intent_id IN (SELECT id FROM payment_intents WHERE case_id=$1)', [caseId]);
      await database().query('DELETE FROM payment_intents WHERE case_id=$1', [caseId]);
      await database().query('DELETE FROM payment_exclusions WHERE po_id=ANY($1::uuid[])', [documentIds]);
      await database().query('DELETE FROM ap2_verification_receipts WHERE evidence_id IN (SELECT e.id FROM ap2_evidence e JOIN payment_grants g ON g.id=e.grant_id WHERE g.case_id=$1)', [caseId]);
      await database().query('DELETE FROM ap2_payment_observations WHERE evidence_id IN (SELECT e.id FROM ap2_evidence e JOIN payment_grants g ON g.id=e.grant_id WHERE g.case_id=$1)', [caseId]);
      await database().query('DELETE FROM ap2_evidence WHERE grant_id IN (SELECT id FROM payment_grants WHERE case_id=$1)', [caseId]);
      await database().query('DELETE FROM payment_grants WHERE case_id=$1', [caseId]);
      await database().query('DELETE FROM payment_decisions WHERE case_id=$1', [caseId]);
      await database().query('DELETE FROM payment_reviews WHERE case_id=$1', [caseId]);
      await database().query('DELETE FROM ap2_delegations WHERE authorization_id IN (SELECT id FROM purchase_authorizations WHERE case_id=$1)', [caseId]);
      await database().query('DELETE FROM purchase_authorizations WHERE case_id=$1', [caseId]);
      await database().query('DELETE FROM purchase_plans WHERE case_id=$1', [caseId]);
      await database().query('DELETE FROM reconciliations WHERE case_id=$1', [caseId]);
      await database().query('DELETE FROM workflow_jobs WHERE case_id=$1', [caseId]);
      await database().query('DELETE FROM cases WHERE id=$1', [caseId]);
    }
    await database().query('DELETE FROM audit_events WHERE actor_id=$1', [actorId]);
    for (const id of documentIds) {
      await database().query('DELETE FROM document_events WHERE document_id=$1', [id]);
      await database().query('DELETE FROM document_versions WHERE document_id=$1', [id]);
      await database().query('DELETE FROM documents WHERE id=$1', [id]);
    }
    await database().query('DELETE FROM demo_users WHERE id=$1', [actorId]);
  });

  it('exige revisión humana y solo permite una reserva por PO', async () => {
    const poBytes = document('PO', number);
    const invoiceBytes = document('INVOICE', 'REFERENCIA-ERRONEA');
    const po = await createDocument(parseDocument(poBytes, 'json', 'PO'), poBytes, actorId);
    const invoice = await createDocument(parseDocument(invoiceBytes, 'json', 'INVOICE'), invoiceBytes, actorId);
    documentIds.push(po.documentId, invoice.documentId);
    const created = await createCase('Compra con excepción', actorId);
    caseId = created.id;
    const withPo = await linkDocument(caseId, 'PO', po, created.version);
    const withInvoice = await linkDocument(caseId, 'INVOICE', invoice, withPo.version);
    await database().query(`INSERT INTO purchase_plans(id,case_id,po_ref,selections,shipping_address,hash,merchant_website,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [planId, caseId, po,
      JSON.stringify([{ sku: 'DEMO', productId: 'product-test', variantId: 'variant-test', quantity: 1, price: { currency: 'MXN', minorUnits: '116000' } }]),
      { firstName: 'Demo', lastName: 'User', phone: '+525500000000', addressLine1: 'Ejemplo 1', city: 'Monterrey', country: 'MX' },
      'plan-hash', 'https://acteck.example', actorId]);
    const auth = await approvePurchase({ caseId, expectedCaseVersion: withInvoice.version, po,
      plan: { id: planId, po, hash: 'plan-hash', merchantId: 'acteck' }, enrollment: { id: 'enrollment-test', status: 'ACTIVE' }, actorId });
    expect(auth.state).toBe('ACTIVE');
    const reconciliation = await reconcileCase(caseId);
    expect(reconciliation.status).toBe('MISMATCHED');
    const quoteId = randomUUID();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const providerQuote = { id: quoteId, expiresAt, amountBreakdown: { finalAmount: { amount: 1160, currency: 'MXN' } }, shippingOptions: [] };
    const quote = { quoteId, merchantId: 'acteck', merchantWebsite: 'https://acteck.example',
      purchasePlanHash: 'plan-hash', amount: { currency: 'MXN' as const, minorUnits: '116000' },
      expiresAt, termsHash: canonicalHash({ planHash: 'plan-hash', quote: providerQuote }) };
    await expect(createPaymentGrant({ caseId, reconciliationId: reconciliation.id, quote, mode: 'AUTO' })).rejects.toThrow();
    await expect(createPaymentGrant({ caseId, reconciliationId: reconciliation.id, quote, mode: 'AUTHORIZE_EXCEPTION', actorId, justification: 'Acepto la referencia distinta' })).rejects.toThrow();
    const current = await database().query<{ version: number }>('SELECT version FROM cases WHERE id=$1', [caseId]);
    await recordReview(caseId, reconciliation.id, current.rows[0].version, actorId);
    const approved = await createPaymentGrant({ caseId, reconciliationId: reconciliation.id, quote, mode: 'AUTHORIZE_EXCEPTION', actorId, justification: 'Acepto la referencia distinta' });
    expect(approved.state).toBe('AVAILABLE');
    const evidence = await bindEvidence(approved.id);
    expect(evidence.verificationReceipt).toBeTruthy();
    await expect(verifyEvidence(evidence.id)).resolves.toMatchObject({ valid: true });
    await database().query('UPDATE ap2_evidence SET checkout_hash=$2 WHERE id=$1', [evidence.id, 'alterado']);
    await expect(verifyEvidence(evidence.id)).rejects.toMatchObject({ code: 'AP2_HASH_MISMATCH' });
    await database().query('UPDATE ap2_evidence SET checkout_hash=$2 WHERE id=$1', [evidence.id, evidence.checkoutHash]);
    process.env.REAP_BASE_URL = 'https://sg.sandbox.api.reap.global';
    process.env.REAP_API_KEY = 'fixture-secret';
    process.env.REAP_VERSION = '2025-02-14';
    process.env.REAP_KEY_EXPIRES_AT = '2099-01-01T00:00:00Z';
    process.env.APP_BASE_URL = 'https://demo.example';
    const checkoutId = randomUUID();
    const send = vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
      const path = String(url);
      if (path.endsWith('/agentic/enrollments/enrollment-test')) return Response.json({ id: 'enrollment-test', status: 'ACTIVE', nextAction: null });
      if (path.endsWith(`/agentic/quotes/${quoteId}`)) return Response.json(providerQuote);
      if (path.endsWith('/agentic/checkouts') && options?.method === 'POST') return Response.json({ id: checkoutId,
        status: 'REQUIRES_ACTION', quoteId, enrollmentId: 'enrollment-test', nextAction: { type: 'REDIRECT', url: 'https://pay.reap.global/approve' } });
      if (path.endsWith(`/agentic/checkouts/${checkoutId}`)) return Response.json({ id: checkoutId, status: 'COMPLETED',
        quoteId, enrollmentId: 'enrollment-test', orderId: 'order-test', finalAmount: { amount: 1160, currency: 'MXN' }, nextAction: null });
      throw new Error(`Unexpected mock call: ${path}`);
    });
    const client = new ReapClient(send);
    const pending = await executePayment(approved.id, evidence.id, client);
    expect(pending.status).toBe('REQUIRES_ACTION');
    expect((await executePayment(approved.id, evidence.id, client)).paymentIntentId).toBe(pending.paymentIntentId);
    const failureName = `test_payment_failure_${randomUUID().replaceAll('-', '')}`;
    await database().query(`CREATE FUNCTION ${failureName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated commit failure'; END $$`);
    await database().query(`CREATE TRIGGER ${failureName} BEFORE UPDATE ON payment_intents
      FOR EACH ROW WHEN (NEW.id = '${pending.paymentIntentId}'::uuid AND NEW.status = 'COMPLETED') EXECUTE FUNCTION ${failureName}()`);
    try {
      await expect(refreshPayment(pending.paymentIntentId, client)).rejects.toThrow('simulated commit failure');
      expect((await getPaymentGrant(approved.id)).state).toBe('RESERVED');
      const unchanged = await database().query<{ status: string }>('SELECT status FROM payment_intents WHERE id=$1', [pending.paymentIntentId]);
      expect(unchanged.rows[0].status).toBe('REQUIRES_ACTION');
    } finally {
      await database().query(`DROP TRIGGER ${failureName} ON payment_intents`);
      await database().query(`DROP FUNCTION ${failureName}()`);
    }
    const completed = await refreshPayment(pending.paymentIntentId, client);
    expect(completed).toMatchObject({ status: 'COMPLETED', orderId: 'order-test', amountMismatch: false });
    expect(send.mock.calls.filter(([url, options]) => String(url).endsWith('/agentic/checkouts') && options?.method === 'POST')).toHaveLength(1);
    const secondIntent = randomUUID();
    const second = await database().connect();
    try {
      await second.query('BEGIN');
      await expect(reserveGrant(second, approved.id, secondIntent)).rejects.toThrow();
      await second.query('ROLLBACK');
    } finally { second.release(); }
  });
});
