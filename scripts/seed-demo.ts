import { randomUUID } from 'node:crypto';
import { database } from '../src/shared/database';
import { parseDocument } from '../src/modules/documents/parse';
import { createDocument, getDocumentVersion } from '../src/modules/documents/repository';
import { createCase, getCase, linkDocument } from '../src/modules/payment-workflow/cases';
import purchaseOrders from '../fixtures/demo-purchase-orders.json';

const email = process.env.DEMO_EMAIL?.trim().toLowerCase();
const hash = process.env.DEMO_PASSWORD_HASH;
if (!email || !hash?.startsWith('scrypt:')) throw new Error('Configura DEMO_EMAIL y DEMO_PASSWORD_HASH');
const samples = purchaseOrders.map((sample) => {
  const original = Buffer.from(JSON.stringify(sample.document, null, 2));
  return { title: sample.title, original, parsed: parseDocument(original, 'json', 'PO') };
});
const client = await database().connect();
let added = 0;
let existing = 0;
try {
  await client.query('SELECT pg_advisory_lock($1)', [711024]);
  const user = await client.query<{ id: string }>(`INSERT INTO demo_users(id,email,password_hash) VALUES($1,$2,$3)
    ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash RETURNING id`, [randomUUID(), email, hash]);
  const actorId = user.rows[0].id;
  for (const sample of samples) {
    const found = await client.query<{ id: string }>(`SELECT id FROM documents
      WHERE kind='PO' AND initial_supplier_id=$1 AND document_number=$2`,
      [sample.parsed.data.supplierId, sample.parsed.data.documentNumber]);
    const documentId = found.rows[0]?.id;
    if (documentId && (await client.query('SELECT 1 FROM cases WHERE po_id=$1 LIMIT 1', [documentId])).rows.length) {
      existing++;
      continue;
    }
    const document = documentId ? await getDocumentVersion(documentId)
      : await createDocument(sample.parsed, sample.original, actorId);
    if (!document) throw new Error(`Documento sin versión: ${sample.parsed.data.documentNumber}`);
    // Recupera un caso vacío si una ejecución anterior se interrumpió antes del vínculo.
    const pending = await client.query<{ id: string }>(`SELECT id FROM cases
      WHERE title=$1 AND created_by=$2 AND po_id IS NULL AND invoice_id IS NULL AND status='WAITING_PO_AUTH'
      ORDER BY created_at,id LIMIT 1`, [sample.title, actorId]);
    const purchase = pending.rows[0] ? await getCase(pending.rows[0].id) : await createCase(sample.title, actorId);
    await linkDocument(purchase.id, 'PO', document, purchase.version);
    added++;
  }
  process.stdout.write(`Aprobador de demo preparado. PO creadas: ${added}; ya existentes: ${existing}.\n`);
} finally {
  await client.query('SELECT pg_advisory_unlock($1)', [711024]);
  client.release();
  await database().end();
}
