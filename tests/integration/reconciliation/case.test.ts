import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { database } from '../../../src/shared/database';
import { parseDocument } from '../../../src/modules/documents/parse';
import { createDocument } from '../../../src/modules/documents/repository';
import { createCase, linkDocument } from '../../../src/modules/payment-workflow/cases';
import { reconcileCase } from '../../../src/modules/reconciliation/service';
import { processOneJob } from '../../../src/modules/payment-workflow/jobs';

const actorId = randomUUID();
const number = `PO-${randomUUID()}`;
const ids: string[] = [];
let caseId = '';

function bytes(kind: 'PO' | 'INVOICE', reference = number, total = '5000') {
  return Buffer.from(JSON.stringify({
    schemaVersion: '1', kind, documentNumber: kind === 'PO' ? number : `F-${randomUUID()}`,
    poReference: reference, supplierId: 'acteck', supplierName: 'Acteck', issuedAt: '2026-10-09',
    total: { currency: 'MXN', minorUnits: total },
    items: kind === 'PO' ? [{ sku: 'DEMO', description: 'Equipo', quantity: 1, unitPriceMinorUnits: '5000' }] : [],
  }));
}

describe.runIf(Boolean(process.env.DATABASE_URL))('caso y conciliación persistentes', () => {
  beforeAll(async () => {
    await database().query('INSERT INTO demo_users(id,email,password_hash) VALUES($1,$2,$3)', [actorId, `${actorId}@example.test`, 'test-only']);
  });
  afterAll(async () => {
    if (caseId) {
      await database().query('DELETE FROM workflow_jobs WHERE case_id=$1', [caseId]);
      await database().query('DELETE FROM reconciliations WHERE case_id=$1', [caseId]);
      await database().query('DELETE FROM cases WHERE id=$1', [caseId]);
    }
    for (const id of ids) {
      await database().query('DELETE FROM document_events WHERE document_id=$1', [id]);
      await database().query('DELETE FROM document_versions WHERE document_id=$1', [id]);
      await database().query('DELETE FROM documents WHERE id=$1', [id]);
    }
    await database().query('DELETE FROM demo_users WHERE id=$1', [actorId]);
  });

  it('vincula factura con referencia errónea y conserva la diferencia', async () => {
    const poBytes = bytes('PO');
    const invoiceBytes = bytes('INVOICE', 'PO-EQUIVOCADA');
    const po = await createDocument(parseDocument(poBytes, 'json', 'PO'), poBytes, actorId);
    const invoice = await createDocument(parseDocument(invoiceBytes, 'json', 'INVOICE'), invoiceBytes, actorId);
    ids.push(po.documentId, invoice.documentId);
    const created = await createCase('Compra de equipo', actorId);
    caseId = created.id;
    const withPo = await linkDocument(caseId, 'PO', po, created.version);
    await expect(linkDocument(caseId, 'INVOICE', invoice, created.version)).rejects.toThrow();
    const withInvoice = await linkDocument(caseId, 'INVOICE', invoice, withPo.version);
    expect(withInvoice.status).toBe('RECONCILING');
    expect(await processOneJob()).toBe(true);
    const result = await reconcileCase(caseId);
    expect(result.status).toBe('MISMATCHED');
    expect(result.differences.map((difference) => difference.field)).toEqual(['PO_REFERENCE']);
    expect((await reconcileCase(caseId)).id).toBe(result.id);
  });
});
