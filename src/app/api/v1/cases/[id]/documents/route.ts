import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { canonicalHash } from '@/shared/canonical-json';
import { errorResponse } from '@/shared/errors';
import { idempotent } from '@/shared/http-idempotency';
import { documentRefSchema, jsonInput } from '@/shared/http-validation';
import { authorizedMutation } from '@/shared/session';
import { linkDocument } from '@/modules/payment-workflow/cases';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authorizedMutation(request);
    const { id } = await context.params;
    const body = await jsonInput(request, z.strictObject({
      role: z.enum(['PO', 'INVOICE']), document: documentRefSchema, expectedCaseVersion: z.number().int().positive(),
    }));
    return idempotent(user.actorId, `cases:${id}:link`, request.headers.get('idempotency-key'), canonicalHash(body),
      async () => ({ status: 200, data: await linkDocument(id, body.role, body.document, body.expectedCaseVersion) }));
  } catch (error) { return errorResponse(error); }
}
