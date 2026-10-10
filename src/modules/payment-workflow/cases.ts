import { randomUUID } from 'node:crypto';
import { database, transaction } from '@/shared/database';
import { AppError } from '@/shared/errors';
import type { DocumentRef, DocumentKind } from '@/modules/documents/contracts';
import { getDocumentVersion } from '@/modules/documents/repository';
import { enqueueReconciliation } from './jobs';

interface CaseRow {
  id: string; title: string; version: number; po_id: string | null; po_version: number | null;
  invoice_id: string | null; invoice_version: number | null; status: string; created_at: Date; updated_at: Date;
}
export interface CaseSummary {
  id: string; title: string; version: number; status: string;
  po: DocumentRef | null; invoice: DocumentRef | null; createdAt: string; updatedAt: string;
}

async function view(row: CaseRow): Promise<CaseSummary> {
  const [po, invoice] = await Promise.all([
    row.po_id && row.po_version ? getDocumentVersion(row.po_id, row.po_version) : null,
    row.invoice_id && row.invoice_version ? getDocumentVersion(row.invoice_id, row.invoice_version) : null,
  ]);
  const ref = (item: Awaited<ReturnType<typeof getDocumentVersion>>): DocumentRef | null => item ? {
    documentId: item.documentId, version: item.version, sourceHash: item.sourceHash, canonicalHash: item.canonicalHash,
  } : null;
  return { id: row.id, title: row.title, version: row.version, status: row.status, po: ref(po), invoice: ref(invoice), createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}

export async function createCase(title: string, actorId: string): Promise<CaseSummary> {
  const clean = title.trim();
  if (!clean || clean.length > 120) throw new AppError(422, 'INVALID_TITLE', 'El título debe tener entre 1 y 120 caracteres');
  const id = randomUUID();
  const inserted = await database().query<CaseRow>('INSERT INTO cases(id,title,created_by) VALUES($1,$2,$3) RETURNING *', [id, clean, actorId]);
  return view(inserted.rows[0]);
}

export async function getCase(id: string): Promise<CaseSummary> {
  const found = await database().query<CaseRow>('SELECT * FROM cases WHERE id=$1', [id]);
  if (!found.rows[0]) throw new AppError(404, 'CASE_NOT_FOUND', 'Caso no encontrado');
  return view(found.rows[0]);
}

export async function listCases(page: number, pageSize: number, state?: string): Promise<{ items: CaseSummary[]; totalItems: number }> {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new AppError(400, 'INVALID_PAGE', 'Paginación inválida');
  const clause = state ? 'WHERE status=$3' : '';
  const params = state ? [pageSize, (page - 1) * pageSize, state] : [pageSize, (page - 1) * pageSize];
  const result = await database().query<CaseRow>(`SELECT * FROM cases ${clause} ORDER BY updated_at DESC,id LIMIT $1 OFFSET $2`, params);
  const count = await database().query<{ total: string }>(`SELECT count(*) AS total FROM cases ${state ? 'WHERE status=$1' : ''}`, state ? [state] : []);
  return { items: await Promise.all(result.rows.map(view)), totalItems: Number(count.rows[0].total) };
}

export async function linkDocument(caseId: string, role: DocumentKind, document: DocumentRef, expectedCaseVersion: number): Promise<CaseSummary> {
  const updated = await transaction(async (client) => {
    const found = await client.query<CaseRow>('SELECT * FROM cases WHERE id=$1 FOR UPDATE', [caseId]);
    const row = found.rows[0];
    if (!row) throw new AppError(404, 'CASE_NOT_FOUND', 'Caso no encontrado');
    if (row.version !== expectedCaseVersion) throw new AppError(409, 'STALE_CASE', 'El caso cambió; actualiza la pantalla');
    if (['PAYING', 'PROCESSING', 'COMPLETED', 'UNKNOWN'].includes(row.status)) throw new AppError(409, 'PAYMENT_STARTED', 'El caso ya inició un pago');
    const match = await client.query<{ kind: string; current_version: number; source_hash: string; canonical_hash: string }>(
      `SELECT d.kind,d.current_version,v.source_hash,v.canonical_hash FROM documents d
       JOIN document_versions v ON v.document_id=d.id AND v.version=d.current_version WHERE d.id=$1`, [document.documentId]);
    const actual = match.rows[0];
    if (!actual || actual.kind !== role || actual.current_version !== document.version || actual.source_hash !== document.sourceHash || actual.canonical_hash !== document.canonicalHash) {
      throw new AppError(422, 'INVALID_DOCUMENT_REF', 'La referencia del documento no corresponde a su versión vigente');
    }
    const hasPo = role === 'PO' || Boolean(row.po_id);
    const hasInvoice = role === 'INVOICE' || Boolean(row.invoice_id);
    const state = hasPo && hasInvoice ? 'RECONCILING' : hasPo ? 'WAITING_INVOICE' : 'WAITING_PO_AUTH';
    const query = role === 'PO'
      ? 'UPDATE cases SET po_id=$2,po_version=$3,status=$4,version=version+1,updated_at=now() WHERE id=$1 RETURNING *'
      : 'UPDATE cases SET invoice_id=$2,invoice_version=$3,status=$4,version=version+1,updated_at=now() WHERE id=$1 RETURNING *';
    const result = await client.query<CaseRow>(query, [caseId, document.documentId, document.version, state]);
    if (state === 'RECONCILING') await enqueueReconciliation(client, caseId, result.rows[0].version);
    return result.rows[0];
  });
  return view(updated);
}
