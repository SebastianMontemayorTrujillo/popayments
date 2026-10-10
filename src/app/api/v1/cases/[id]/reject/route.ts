import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { canonicalHash } from '@/shared/canonical-json';
import { errorResponse } from '@/shared/errors';
import { idempotent } from '@/shared/http-idempotency';
import { jsonInput } from '@/shared/http-validation';
import { authorizedMutation } from '@/shared/session';
import { rejectPayment } from '@/modules/authorization/service';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authorizedMutation(request);
    const { id } = await context.params;
    const body = await jsonInput(request, z.strictObject({ expectedCaseVersion: z.number().int().positive(), justification: z.string().trim().min(10).max(1000) }));
    return idempotent(user.actorId, `cases:${id}:reject`, request.headers.get('idempotency-key'), canonicalHash(body),
      async () => ({ status: 201, data: { decisionId: await rejectPayment(id, body.expectedCaseVersion, user.actorId, body.justification) } }));
  } catch (error) { return errorResponse(error); }
}
