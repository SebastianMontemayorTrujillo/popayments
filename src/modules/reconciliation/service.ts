import { randomUUID } from 'node:crypto';
import { database, transaction } from '@/shared/database';
import { AppError } from '@/shared/errors';
import type { DocumentData, DocumentRef } from '@/modules/documents/contracts';
import { compareHeaders, type Comparison } from './compare';

interface Row {
  id: string; case_id: string; po_id: string; po_version: number; invoice_id: string; invoice_version: number;
  status: 'MATCHED' | 'MISMATCHED'; differences: Comparison['differences']; created_at: Date;
}
export interface ReconciliationResult extends Comparison {
  id: string; caseId: string; po: DocumentRef; invoice: DocumentRef; rulesVersion: 'header-v1'; createdAt: string;
}
async function present(row: Row): Promise<ReconciliationResult> {
  const found = await database().query<{ document_id: string; version: number; source_hash: string; canonical_hash: string }>(
    `SELECT document_id,version,source_hash,canonical_hash FROM document_versions
     WHERE (document_id=$1 AND version=$2) OR (document_id=$3 AND version=$4)`,
    [row.po_id, row.po_version, row.invoice_id, row.invoice_version]);
  const doc = (id: string): DocumentRef => {
    const item = found.rows.find((candidate) => candidate.document_id === id);
    if (!item) throw new AppError(500, 'BROKEN_RECONCILIATION', 'Falta un documento conciliado');
    return { documentId: item.document_id, version: item.version, sourceHash: item.source_hash, canonicalHash: item.canonical_hash };
  };
  return { id: row.id, caseId: row.case_id, po: doc(row.po_id), invoice: doc(row.invoice_id), rulesVersion: 'header-v1', status: row.status, differences: row.differences, createdAt: row.created_at.toISOString() };
}

export async function reconcileCase(caseId: string): Promise<ReconciliationResult> {
  const row = await transaction(async (client) => {
    const caseResult = await client.query<{ po_id: string | null; po_version: number | null; invoice_id: string | null; invoice_version: number | null }>(
      'SELECT po_id,po_version,invoice_id,invoice_version FROM cases WHERE id=$1 FOR UPDATE', [caseId]);
    const current = caseResult.rows[0];
    if (!current) throw new AppError(404, 'CASE_NOT_FOUND', 'Caso no encontrado');
    if (!current.po_id || !current.po_version || !current.invoice_id || !current.invoice_version) throw new AppError(409, 'MISSING_DOCUMENTS', 'Faltan PO o factura');
    const found = await client.query<{ document_id: string; version: number; data: DocumentData }>(
      `SELECT document_id,version,data FROM document_versions WHERE (document_id=$1 AND version=$2) OR (document_id=$3 AND version=$4)`,
      [current.po_id, current.po_version, current.invoice_id, current.invoice_version]);
    const po = found.rows.find((document) => document.document_id === current.po_id)?.data;
    const invoice = found.rows.find((document) => document.document_id === current.invoice_id)?.data;
    if (!po || !invoice) throw new AppError(422, 'INVALID_DOCUMENT_REF', 'Falta una versión de documento');
    const result = compareHeaders(po, invoice);
    const inserted = await client.query<Row>(`INSERT INTO reconciliations(id,case_id,po_id,po_version,invoice_id,invoice_version,status,differences)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING *`,
      [randomUUID(), caseId, current.po_id, current.po_version, current.invoice_id, current.invoice_version, result.status, JSON.stringify(result.differences)]);
    const matched = inserted.rows[0] ?? (await client.query<Row>(
      `SELECT * FROM reconciliations WHERE po_id=$1 AND po_version=$2 AND invoice_id=$3 AND invoice_version=$4 AND rules_version='header-v1'`,
      [current.po_id, current.po_version, current.invoice_id, current.invoice_version])).rows[0];
    if (matched.case_id !== caseId) throw new AppError(409, 'DOCUMENTS_ALREADY_LINKED', 'La pareja pertenece a otro caso');
    if (inserted.rows[0]) await client.query('UPDATE cases SET status=$2,version=version+1,updated_at=now() WHERE id=$1', [caseId, result.status === 'MATCHED' ? 'WAITING_PO_AUTH' : 'REVIEW_REQUIRED']);
    return matched;
  });
  return present(row);
}

export async function getReconciliation(id: string): Promise<ReconciliationResult> {
  const found = await database().query<Row>('SELECT * FROM reconciliations WHERE id=$1', [id]);
  if (!found.rows[0]) throw new AppError(404, 'RECONCILIATION_NOT_FOUND', 'Conciliación no encontrada');
  return present(found.rows[0]);
}

export async function latestReconciliationForCase(caseId: string): Promise<ReconciliationResult | null> {
  const found = await database().query<Row>('SELECT * FROM reconciliations WHERE case_id=$1 ORDER BY created_at DESC LIMIT 1', [caseId]);
  return found.rows[0] ? present(found.rows[0]) : null;
}
