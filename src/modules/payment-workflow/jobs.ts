import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { database, transaction } from '@/shared/database';
import { AppError } from '@/shared/errors';
import { reconcileCase } from '@/modules/reconciliation/service';

export async function enqueueReconciliation(client: pg.PoolClient, caseId: string, expectedVersion: number): Promise<void> {
  await client.query(`INSERT INTO workflow_jobs(id,kind,case_id,expected_version)
    VALUES($1,'RECONCILE_CASE',$2,$3) ON CONFLICT DO NOTHING`, [randomUUID(), caseId, expectedVersion]);
}

interface JobRow { id: string; kind: 'RECONCILE_CASE' | 'AGENT_RUN'; case_id: string; expected_version: number; attempts: number }

export async function enqueueAgentRun(caseId: string): Promise<string> {
  return transaction(async (client) => {
    const current = await client.query<{ version: number }>('SELECT version FROM cases WHERE id=$1 FOR UPDATE', [caseId]);
    if (!current.rows[0]) throw new AppError(404, 'CASE_NOT_FOUND', 'Caso no encontrado');
    const id = randomUUID();
    const inserted = await client.query<{ id: string }>(`INSERT INTO workflow_jobs(id,kind,case_id,expected_version)
      VALUES($1,'AGENT_RUN',$2,$3) ON CONFLICT(kind,case_id,expected_version) DO UPDATE SET
      status=CASE WHEN workflow_jobs.status IN ('DONE','FAILED') THEN 'PENDING' ELSE workflow_jobs.status END,
      attempts=CASE WHEN workflow_jobs.status IN ('DONE','FAILED') THEN 0 ELSE workflow_jobs.attempts END,
      run_at=now() RETURNING id`,
      [id, caseId, current.rows[0].version]);
    return inserted.rows[0].id;
  });
}

export async function processOneJob(): Promise<boolean> {
  const job = await transaction(async (client) => {
    const found = await client.query<JobRow>(`SELECT * FROM workflow_jobs
      WHERE (status='PENDING' OR (status='RUNNING' AND leased_until<now())) AND run_at<=now()
      ORDER BY run_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1`);
    const row = found.rows[0];
    if (!row) return null;
    await client.query(`UPDATE workflow_jobs SET status='RUNNING',leased_until=now()+interval '30 seconds',attempts=attempts+1 WHERE id=$1`, [row.id]);
    return row;
  });
  if (!job) return false;
  try {
    const current = await database().query<{ version: number; status: string }>('SELECT version,status FROM cases WHERE id=$1', [job.case_id]);
    if (job.kind === 'RECONCILE_CASE') {
      if (current.rows[0]?.version === job.expected_version && current.rows[0].status === 'RECONCILING') {
        const result = await reconcileCase(job.case_id);
        if (result.status === 'MATCHED') await enqueueAgentRun(job.case_id);
      }
    } else {
      const { runAgent } = await import('./agent');
      await runAgent(job.case_id, job.id);
    }
    await database().query(`UPDATE workflow_jobs SET status='DONE',leased_until=NULL WHERE id=$1`, [job.id]);
  } catch (error) {
    const attempts = job.attempts + 1;
    const retry = attempts < 5;
    await database().query(`UPDATE workflow_jobs SET status=$2,leased_until=NULL,
      run_at=now()+($3::integer*interval '1 second'),last_error_code=$4 WHERE id=$1`,
      [job.id, retry ? 'PENDING' : 'FAILED', 2 ** attempts, error instanceof Error ? error.name : 'UNKNOWN']);
  }
  return true;
}
