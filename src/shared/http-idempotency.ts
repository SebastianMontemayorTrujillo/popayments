import { database } from './database';
import { AppError, response } from './errors';

export async function idempotent<T>(
  actorId: string, operation: string, key: string | null, requestHash: string,
  work: () => Promise<{ status: number; data: T }>,
) {
  if (!key || key.length > 255) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Se requiere Idempotency-Key de hasta 255 caracteres');
  const inserted = await database().query(`INSERT INTO http_idempotency(actor_id,operation,key,request_hash,status)
    VALUES($1,$2,$3,$4,'IN_PROGRESS') ON CONFLICT DO NOTHING RETURNING key`, [actorId, operation, key, requestHash]);
  if (!inserted.rows[0]) {
    const prior = await database().query<{ request_hash: string; status: string; response_status: number; response_body: T }>(
      'SELECT request_hash,status,response_status,response_body FROM http_idempotency WHERE actor_id=$1 AND operation=$2 AND key=$3', [actorId, operation, key]);
    if (!prior.rows[0]) throw new AppError(409, 'IDEMPOTENCY_RACE', 'La operación está en curso');
    if (prior.rows[0].request_hash !== requestHash) throw new AppError(422, 'IDEMPOTENCY_MISMATCH', 'La clave ya se usó con otros datos');
    if (prior.rows[0].status !== 'DONE') throw new AppError(409, 'IDEMPOTENCY_IN_PROGRESS', 'La operación está en curso');
    return response(prior.rows[0].response_body, prior.rows[0].response_status);
  }
  try {
    const result = await work();
    await database().query(`UPDATE http_idempotency SET status='DONE',response_status=$4,response_body=$5
      WHERE actor_id=$1 AND operation=$2 AND key=$3`, [actorId, operation, key, result.status, result.data]);
    return response(result.data, result.status);
  } catch (error) {
    await database().query(`DELETE FROM http_idempotency WHERE actor_id=$1 AND operation=$2 AND key=$3 AND status='IN_PROGRESS'`, [actorId, operation, key]);
    throw error;
  }
}
