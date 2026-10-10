import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { database } from '@/shared/database';
import { canonicalHash } from '@/shared/canonical-json';
import { AppError } from '@/shared/errors';
import { ReapClient } from './client';

interface EnrollmentRow {
  id: string; owner_id: string; owner_email: string; provider_id: string | null; status: string;
  next_action_url: string | null; return_state_hash: string; return_url: string;
  idempotency_key: string; request_hash: string; created_at: Date; updated_at: Date;
}
export interface EnrollmentView { id: string; providerId: string | null; status: string; nextActionUrl: string | null; createdAt: string }
function view(row: EnrollmentRow): EnrollmentView {
  return { id: row.id, providerId: row.provider_id, status: row.status, nextActionUrl: row.next_action_url, createdAt: row.created_at.toISOString() };
}
function config() {
  const ownerId = process.env.REAP_OWNER_ID?.trim();
  const email = process.env.REAP_OWNER_EMAIL?.trim();
  const base = process.env.APP_BASE_URL?.trim();
  if (!ownerId || !email || !base?.startsWith('https://')) throw new AppError(503, 'REAP_ENROLLMENT_CONFIG', 'Configura propietario y URL HTTPS de la demo');
  return { ownerId, email, base };
}
function hashState(value: string): string { return createHash('sha256').update(value).digest('hex'); }

export async function createExternalEnrollment(key: string, client = new ReapClient()): Promise<EnrollmentView> {
  if (!key || key.length > 255) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Se requiere Idempotency-Key');
  const { ownerId, email, base } = config();
  const requestHash = canonicalHash({ ownerId, email, base });
  const existing = await database().query<EnrollmentRow>('SELECT * FROM reap_enrollments WHERE idempotency_key=$1', [key]);
  if (existing.rows[0]) {
    if (existing.rows[0].request_hash !== requestHash) throw new AppError(422, 'IDEMPOTENCY_MISMATCH', 'La clave ya se usó con otros datos');
    return view(existing.rows[0]);
  }
  const active = await database().query<EnrollmentRow>(`SELECT * FROM reap_enrollments WHERE owner_id=$1 AND status IN ('UNKNOWN','REQUIRES_ACTION','ACTIVE') ORDER BY created_at DESC LIMIT 1`, [ownerId]);
  if (active.rows[0]) throw new AppError(409, 'ENROLLMENT_ALREADY_EXISTS', 'Ya existe un enrollment vigente o incierto');
  const state = randomBytes(32).toString('base64url');
  const returnUrl = `${base}/payments/return?state=${encodeURIComponent(state)}`;
  const id = randomUUID();
  const inserted = await database().query<EnrollmentRow>(`INSERT INTO reap_enrollments
    (id,owner_id,owner_email,status,return_state_hash,return_url,idempotency_key,request_hash)
    VALUES($1,$2,$3,'UNKNOWN',$4,$5,$6,$7) ON CONFLICT(idempotency_key) DO NOTHING RETURNING *`,
    [id, ownerId, email, hashState(state), returnUrl, key, requestHash]);
  if (!inserted.rows[0]) throw new AppError(409, 'ENROLLMENT_IN_PROGRESS', 'La solicitud de enrollment está en curso');
  return retryEnrollment(id, client);
}

export async function retryEnrollment(id: string, client = new ReapClient()): Promise<EnrollmentView> {
  const found = await database().query<EnrollmentRow>('SELECT * FROM reap_enrollments WHERE id=$1', [id]);
  const row = found.rows[0];
  if (!row) throw new AppError(404, 'ENROLLMENT_NOT_FOUND', 'Enrollment no encontrado');
  if (row.provider_id) return view(row);
  if (Date.now() - row.created_at.getTime() > 23 * 60 * 60 * 1_000) throw new AppError(409, 'REAP_RESULT_UNKNOWN', 'Es necesario resolver la solicitud incierta con Reap antes de repetirla');
  const result = await client.createExternalEnrollment({ ownerId: row.owner_id, email: row.owner_email, returnUrl: row.return_url, idempotencyKey: row.idempotency_key });
  const updated = await database().query<EnrollmentRow>(`UPDATE reap_enrollments SET provider_id=$2,status=$3,next_action_url=$4,updated_at=now()
    WHERE id=$1 RETURNING *`, [id, result.id, result.status, result.nextAction?.url ?? null]);
  return view(updated.rows[0]);
}

export async function getEnrollment(id: string, refresh = false, client = new ReapClient()): Promise<EnrollmentView> {
  const found = await database().query<EnrollmentRow>('SELECT * FROM reap_enrollments WHERE id=$1', [id]);
  const row = found.rows[0];
  if (!row) throw new AppError(404, 'ENROLLMENT_NOT_FOUND', 'Enrollment no encontrado');
  if (!refresh || !row.provider_id) return view(row);
  const result = await client.getEnrollment(row.provider_id);
  const updated = await database().query<EnrollmentRow>(`UPDATE reap_enrollments SET status=$2,next_action_url=$3,updated_at=now() WHERE id=$1 RETURNING *`,
    [id, result.status, result.nextAction?.url ?? null]);
  return view(updated.rows[0]);
}

export async function listEnrollments(): Promise<EnrollmentView[]> {
  const ownerId = process.env.REAP_OWNER_ID?.trim();
  if (!ownerId) return [];
  const found = await database().query<EnrollmentRow>('SELECT * FROM reap_enrollments WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 10', [ownerId]);
  return found.rows.map(view);
}

export async function findEnrollmentByReturnState(state: string): Promise<EnrollmentView> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new AppError(400, 'INVALID_RETURN_STATE', 'Retorno inválido');
  const found = await database().query<EnrollmentRow>('SELECT * FROM reap_enrollments WHERE return_state_hash=$1', [hashState(state)]);
  if (!found.rows[0]) throw new AppError(404, 'INVALID_RETURN_STATE', 'Retorno desconocido');
  return view(found.rows[0]);
}
