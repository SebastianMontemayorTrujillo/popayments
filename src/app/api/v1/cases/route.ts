import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { canonicalHash } from '@/shared/canonical-json';
import { errorResponse, response } from '@/shared/errors';
import { idempotent } from '@/shared/http-idempotency';
import { jsonInput } from '@/shared/http-validation';
import { authenticated, authorizedMutation } from '@/shared/session';
import { createCase, listCases } from '@/modules/payment-workflow/cases';

export async function GET(request: NextRequest) {
  try {
    await authenticated(request);
    const page = Number(request.nextUrl.searchParams.get('page') ?? '1');
    const pageSize = Number(request.nextUrl.searchParams.get('pageSize') ?? '20');
    const state = request.nextUrl.searchParams.get('status') ?? undefined;
    const found = await listCases(page, pageSize, state);
    return response({ ...found, pagination: { page, pageSize, totalItems: found.totalItems } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authorizedMutation(request);
    const body = await jsonInput(request, z.strictObject({ title: z.string().min(1).max(120) }));
    return idempotent(user.actorId, 'cases:create', request.headers.get('idempotency-key'), canonicalHash(body),
      async () => ({ status: 201, data: await createCase(body.title, user.actorId) }));
  } catch (error) { return errorResponse(error); }
}
