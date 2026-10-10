import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, response } from '@/shared/errors';
import { jsonInput } from '@/shared/http-validation';
import { authenticated, authorizedMutation } from '@/shared/session';
import { createQuote, latestQuote } from '@/modules/reap-payments/quotes';
import { enqueueAgentRun } from '@/modules/payment-workflow/jobs';

export async function GET(request: NextRequest) {
  try {
    await authenticated(request);
    const caseId = z.uuid().parse(request.nextUrl.searchParams.get('caseId'));
    return response(await latestQuote(caseId));
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    await authorizedMutation(request);
    const body = await jsonInput(request, z.strictObject({ caseId: z.uuid(), planId: z.uuid() }));
    const quote = await createQuote({ ...body, key: request.headers.get('idempotency-key') ?? '' });
    await enqueueAgentRun(body.caseId);
    return response(quote, 201);
  } catch (error) { return errorResponse(error); }
}
