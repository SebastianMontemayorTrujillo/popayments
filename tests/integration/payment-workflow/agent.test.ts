import { randomUUID } from 'node:crypto';
import type OpenAI from 'openai';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { database } from '@/shared/database';
import { createCase } from '@/modules/payment-workflow/cases';
import { enqueueAgentRun } from '@/modules/payment-workflow/jobs';
import { agentTools, executeAgentTool, latestAgentRun, runAgent } from '@/modules/payment-workflow/agent';

const actorId = randomUUID();
let caseId = '';
const saved = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_MODEL: process.env.OPENAI_MODEL };

describe.runIf(Boolean(process.env.DATABASE_URL))('coordinación con herramientas de OpenAI', () => {
  afterAll(async () => {
    if (caseId) {
      await database().query('DELETE FROM agent_tool_events WHERE run_id IN (SELECT id FROM agent_runs WHERE case_id=$1)', [caseId]);
      await database().query('DELETE FROM agent_runs WHERE case_id=$1', [caseId]);
      await database().query('DELETE FROM workflow_jobs WHERE case_id=$1', [caseId]);
      await database().query('DELETE FROM cases WHERE id=$1', [caseId]);
    }
    await database().query('DELETE FROM demo_users WHERE id=$1', [actorId]);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  it('registra llamadas reales y no ofrece herramientas de consentimiento humano', async () => {
    await database().query('INSERT INTO demo_users(id,email,password_hash) VALUES($1,$2,$3)', [actorId, `${actorId}@example.test`, 'test-only']);
    caseId = (await createCase('Caso de agente', actorId)).id;
    const jobId = await enqueueAgentRun(caseId);
    process.env.OPENAI_API_KEY = 'fixture-key';
    process.env.OPENAI_MODEL = 'fixture-model';
    const create = vi.fn()
      .mockResolvedValueOnce({ output: [{ type: 'function_call', name: 'get_case', call_id: 'call-1', arguments: '{}' }], output_text: '' })
      .mockResolvedValueOnce({ output: [{ type: 'message', role: 'assistant', content: [] }], output_text: 'Esperando documentos.' });
    const client = { responses: { create } } as unknown as OpenAI;
    await runAgent(caseId, jobId, client);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0]).toMatchObject({ parallel_tool_calls: false, store: false });
    expect(create.mock.calls[1][0].input).toContainEqual(expect.objectContaining({ type: 'function_call_output', call_id: 'call-1' }));
    expect(await latestAgentRun(caseId)).toMatchObject({ status: 'COMPLETED', toolCalls: 1 });
    expect(agentTools.some((tool) => /approv|consent|authoriz/i.test(tool.name))).toBe(false);
    await expect(executeAgentTool(caseId, jobId, 'approve_po', {})).rejects.toMatchObject({ code: 'UNKNOWN_AGENT_TOOL' });
  });
});
