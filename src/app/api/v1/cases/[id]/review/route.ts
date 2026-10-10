import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { canonicalHash } from '@/shared/canonical-json';
import { errorResponse } from '@/shared/errors';
import { idempotent } from '@/shared/http-idempotency';
import { jsonInput } from '@/shared/http-validation';
import { authorizedMutation } from '@/shared/session';
import { recordReview } from '@/modules/authorization/service';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authorizedMutation(request);
    const { id } = await context.params;
    const body = await jsonInput(request, z.strictObject({ reconciliationId: z.uuid(), expectedCaseVersion: z.number().int().positive() }));
    return idempotent(user.actorId, `cases:${id}:review`, request.headers.get('idempotency-key'), canonicalHash(body),
      async () => ({ status: 201, data: { reviewId: await recordReview(id, body.reconciliationId, body.expectedCaseVersion, user.actorId) } }));
  } catch (error) { return errorResponse(error); }
}
