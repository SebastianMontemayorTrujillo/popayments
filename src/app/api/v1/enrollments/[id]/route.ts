import type { NextRequest } from 'next/server';
import { errorResponse, response } from '@/shared/errors';
import { authenticated } from '@/shared/session';
import { getEnrollment } from '@/modules/reap-payments/enrollments';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await authenticated(request);
    return response(await getEnrollment((await context.params).id, true));
  } catch (error) { return errorResponse(error); }
}
