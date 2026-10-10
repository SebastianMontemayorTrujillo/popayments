import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { database } from '../../../src/shared/database';
import { parseDocument } from '../../../src/modules/documents/parse';
import { createDocument } from '../../../src/modules/documents/repository';
import { createCase, linkDocument } from '../../../src/modules/payment-workflow/cases';
import { reconcileCase } from '../../../src/modules/reconciliation/service';
import { approvePurchase, createPaymentGrant, recordReview, reserveGrant } from '../../../src/modules/authorization/service';

const actorId = randomUUID();
const number = `PO-${randomUUID()}`;
let caseId = '';
const documentIds: string[] = [];

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
    await database().query('INSERT INTO demo_users(id,email,password_hash) VALUES($1,$2,$3)', [actorId, `${actorId}@example.test`, 'test-only']);
  });
  afterAll(async () => {
    if (caseId) {
      await database().query('DELETE FROM payment_exclusions WHERE po_id=ANY($1::uuid[])', [documentIds]);
      await database().query('DELETE FROM payment_grants WHERE case_id=$1', [caseId]);
      await database().query('DELETE FROM payment_decisions WHERE case_id=$1', [caseId]);
      await database().query('DELETE FROM payment_reviews WHERE case_id=$1', [caseId]);
      await database().query('DELETE FROM purchase_authorizations WHERE case_id=$1', [caseId]);
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
    const auth = await approvePurchase({ caseId, expectedCaseVersion: withInvoice.version, po,
      plan: { id: randomUUID(), po, hash: 'plan-hash', merchantId: 'acteck' }, enrollment: { id: 'enrollment-test', status: 'ACTIVE' }, actorId });
    expect(auth.state).toBe('ACTIVE');
    const reconciliation = await reconcileCase(caseId);
    expect(reconciliation.status).toBe('MISMATCHED');
    const quote = { quoteId: randomUUID(), merchantId: 'acteck', merchantWebsite: 'https://acteck.com',
      purchasePlanHash: 'plan-hash', amount: { currency: 'MXN' as const, minorUnits: '116000' },
      expiresAt: new Date(Date.now() + 60_000).toISOString(), termsHash: 'terms-hash' };
    await expect(createPaymentGrant({ caseId, reconciliationId: reconciliation.id, quote, mode: 'AUTO' })).rejects.toThrow();
    await expect(createPaymentGrant({ caseId, reconciliationId: reconciliation.id, quote, mode: 'AUTHORIZE_EXCEPTION', actorId, justification: 'Acepto la referencia distinta' })).rejects.toThrow();
    const current = await database().query<{ version: number }>('SELECT version FROM cases WHERE id=$1', [caseId]);
    await recordReview(caseId, reconciliation.id, current.rows[0].version, actorId);
    const approved = await createPaymentGrant({ caseId, reconciliationId: reconciliation.id, quote, mode: 'AUTHORIZE_EXCEPTION', actorId, justification: 'Acepto la referencia distinta' });
    expect(approved.state).toBe('AVAILABLE');
    const firstIntent = randomUUID();
    const reserved = await database().connect();
    try {
      await reserved.query('BEGIN');
      await reserveGrant(reserved, approved.id, firstIntent);
      await reserved.query('COMMIT');
    } finally { reserved.release(); }
    const secondIntent = randomUUID();
    const second = await database().connect();
    try {
      await second.query('BEGIN');
      await expect(reserveGrant(second, approved.id, secondIntent)).rejects.toThrow();
      await second.query('ROLLBACK');
    } finally { second.release(); }
  });
});
