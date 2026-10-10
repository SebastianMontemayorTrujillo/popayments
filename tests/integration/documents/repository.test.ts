import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { database } from '../../../src/shared/database';
import { createDocument, getDocumentVersion, addDocumentVersion } from '../../../src/modules/documents/repository';
import { parseDocument } from '../../../src/modules/documents/parse';

const userId = randomUUID();
const number = `PO-${randomUUID()}`;
const source = (total: string) => Buffer.from(JSON.stringify({
  schemaVersion: '1', kind: 'PO', documentNumber: number, poReference: number,
  supplierId: 'acteck', supplierName: 'Acteck', issuedAt: '2026-10-09',
  total: { currency: 'MXN', minorUnits: total },
  items: [{ sku: 'DEMO', description: 'Equipo', quantity: 1, unitPriceMinorUnits: '10000' }],
}));

describe.runIf(Boolean(process.env.DATABASE_URL))('documentos persistidos', () => {
  beforeAll(async () => {
    await database().query('INSERT INTO demo_users(id,email,password_hash) VALUES($1,$2,$3)', [userId, `${userId}@example.com`, 'test-only']);
  });
  afterAll(async () => {
    const found = await database().query<{ id: string }>('SELECT id FROM documents WHERE document_number=$1', [number]);
    if (found.rows[0]) {
      const id = found.rows[0].id;
      await database().query('DELETE FROM document_events WHERE document_id=$1', [id]);
      await database().query('DELETE FROM document_versions WHERE document_id=$1', [id]);
      await database().query('DELETE FROM documents WHERE id=$1', [id]);
    }
    await database().query('DELETE FROM demo_users WHERE id=$1', [userId]);
  });

  it('no duplica una carga y conserva la versión anterior tras revisar', async () => {
    const firstBytes = source('116000');
    const first = await createDocument(parseDocument(firstBytes, 'json', 'PO'), firstBytes, userId);
    const repeated = await createDocument(parseDocument(firstBytes, 'json', 'PO'), firstBytes, userId);
    expect(repeated).toEqual(first);
    await expect(createDocument(parseDocument(source('116001'), 'json', 'PO'), source('116001'), userId)).rejects.toThrow();

    const nextBytes = source('116001');
    const second = await addDocumentVersion(first.documentId, parseDocument(nextBytes, 'json', 'PO'), nextBytes, userId);
    expect(second.version).toBe(2);
    const original = await getDocumentVersion(first.documentId, 1);
    expect(original?.data.total.minorUnits).toBe('116000');
    expect(original?.original.equals(firstBytes)).toBe(true);
  });
});
