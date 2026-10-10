import type { NextRequest } from 'next/server';
import { errorResponse, response } from '@/shared/errors';
import { authorizedMutation } from '@/shared/session';
import { enqueueAgentRun } from '@/modules/payment-workflow/jobs';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await authorizedMutation(request);
    const jobId = await enqueueAgentRun((await context.params).id);
    return response({ jobId, status: 'QUEUED' }, 202);
  } catch (error) { return errorResponse(error); }
}
