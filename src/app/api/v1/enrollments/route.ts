import type { NextRequest } from 'next/server';
import { errorResponse, response } from '@/shared/errors';
import { authenticated, authorizedMutation } from '@/shared/session';
import { createExternalEnrollment, listEnrollments } from '@/modules/reap-payments/enrollments';

export async function GET(request: NextRequest) {
  try { await authenticated(request); return response(await listEnrollments()); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    await authorizedMutation(request);
    return response(await createExternalEnrollment(request.headers.get('idempotency-key') ?? ''), 201);
  } catch (error) { return errorResponse(error); }
}
