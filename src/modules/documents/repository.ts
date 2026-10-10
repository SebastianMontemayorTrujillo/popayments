import { randomUUID } from 'node:crypto';
import { database, transaction } from '@/shared/database';
import { AppError } from '@/shared/errors';
import type { DocumentData, DocumentFormat, DocumentRef, ParsedDocument } from './contracts';

interface VersionRow {
  document_id: string;
  version: number;
  source_hash: string;
  canonical_hash: string;
  data: DocumentData;
  format: DocumentFormat;
  original: Buffer;
  uploaded_by: string;
  created_at: Date;
}
export type StoredVersion = DocumentRef & { data: DocumentData; format: DocumentFormat; original: Buffer; uploadedBy: string; createdAt: string };

function ref(row: VersionRow): DocumentRef {
  return { documentId: row.document_id, version: row.version, sourceHash: row.source_hash, canonicalHash: row.canonical_hash };
}
function stored(row: VersionRow): StoredVersion {
  return { ...ref(row), data: row.data, format: row.format, original: row.original, uploadedBy: row.uploaded_by, createdAt: row.created_at.toISOString() };
}

export async function createDocument(parsed: ParsedDocument, original: Buffer, actorId: string): Promise<DocumentRef> {
  return transaction(async (client) => {
    const inserted = await client.query<{ id: string }>(`INSERT INTO documents(id,kind,initial_supplier_id,document_number)
      VALUES($1,$2,$3,$4) ON CONFLICT(kind,initial_supplier_id,document_number) DO NOTHING RETURNING id`,
      [randomUUID(), parsed.data.kind, parsed.data.supplierId, parsed.data.documentNumber]);
    if (!inserted.rows[0]) {
      const existing = await client.query<VersionRow>(`SELECT v.* FROM documents d JOIN document_versions v
        ON v.document_id=d.id AND v.version=d.current_version
        WHERE d.kind=$1 AND d.initial_supplier_id=$2 AND d.document_number=$3`,
        [parsed.data.kind, parsed.data.supplierId, parsed.data.documentNumber]);
      if (existing.rows[0]?.source_hash === parsed.sourceHash) return ref(existing.rows[0]);
      throw new AppError(409, 'VERSION_REQUIRED', 'El documento cambió; crea una versión explícita');
    }
    const id = inserted.rows[0].id;
    await client.query(`INSERT INTO document_versions(document_id,version,source_hash,canonical_hash,data,format,original,uploaded_by)
      VALUES($1,1,$2,$3,$4,$5,$6,$7)`,
      [id, parsed.sourceHash, parsed.canonicalHash, parsed.data, parsed.format, original, actorId]);
    await client.query('INSERT INTO document_events(id,document_id,version,event_type) VALUES($1,$2,1,$3)', [randomUUID(), id, 'CREATED']);
    return { documentId: id, version: 1, sourceHash: parsed.sourceHash, canonicalHash: parsed.canonicalHash };
  });
}

export async function addDocumentVersion(id: string, parsed: ParsedDocument, original: Buffer, actorId: string): Promise<DocumentRef> {
  return transaction(async (client) => {
    const found = await client.query<{ kind: string; document_number: string; current_version: number }>(
      'SELECT kind, document_number, current_version FROM documents WHERE id=$1 FOR UPDATE', [id]);
    const document = found.rows[0];
    if (!document) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Documento no encontrado');
    if (document.kind !== parsed.data.kind || document.document_number !== parsed.data.documentNumber) {
      throw new AppError(422, 'IDENTITY_CHANGED', 'La versión debe conservar tipo y número');
    }
    const current = await client.query<VersionRow>('SELECT * FROM document_versions WHERE document_id=$1 AND version=$2', [id, document.current_version]);
    if (current.rows[0].source_hash === parsed.sourceHash) return ref(current.rows[0]);
    const version = document.current_version + 1;
    await client.query(`INSERT INTO document_versions(document_id,version,source_hash,canonical_hash,data,format,original,uploaded_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id, version, parsed.sourceHash, parsed.canonicalHash, parsed.data, parsed.format, original, actorId]);
    await client.query('UPDATE documents SET current_version=$2 WHERE id=$1', [id, version]);
    await client.query('INSERT INTO document_events(id,document_id,version,event_type) VALUES($1,$2,$3,$4)', [randomUUID(), id, version, 'VERSION_ADDED']);
    return { documentId: id, version, sourceHash: parsed.sourceHash, canonicalHash: parsed.canonicalHash };
  });
}

export async function getDocumentVersion(id: string, version?: number): Promise<StoredVersion | null> {
  const result = await database().query<VersionRow>(`SELECT v.* FROM document_versions v JOIN documents d ON d.id=v.document_id
    WHERE d.id=$1 AND v.version=COALESCE($2,d.current_version)`, [id, version ?? null]);
  return result.rows[0] ? stored(result.rows[0]) : null;
}
