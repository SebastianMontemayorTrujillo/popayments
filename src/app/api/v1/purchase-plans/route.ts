import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { canonicalHash } from '@/shared/canonical-json';
import { errorResponse, response } from '@/shared/errors';
import { idempotent } from '@/shared/http-idempotency';
import { jsonInput } from '@/shared/http-validation';
import { authenticated, authorizedMutation } from '@/shared/session';
import { createPurchasePlan, latestPurchasePlan } from '@/modules/reap-payments/plans';

export async function GET(request: NextRequest) {
  try {
    await authenticated(request);
    const caseId = z.uuid().parse(request.nextUrl.searchParams.get('caseId'));
    return response(await latestPurchasePlan(caseId));
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await authorizedMutation(request);
    const body = await jsonInput(request, z.strictObject({ caseId: z.uuid(), expectedCaseVersion: z.number().int().positive(),
      selections: z.array(z.strictObject({ sku: z.string().min(1), productId: z.string().min(1), quantity: z.number().int().positive() })).min(1).max(20) }));
    return idempotent(user.actorId, `plan:${body.caseId}`, request.headers.get('idempotency-key'), canonicalHash(body),
      async () => ({ status: 201, data: await createPurchasePlan({ ...body, actorId: user.actorId }) }));
  } catch (error) { return errorResponse(error); }
}
