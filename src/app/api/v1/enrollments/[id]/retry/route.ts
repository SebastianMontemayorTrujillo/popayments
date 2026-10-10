import type { NextRequest } from 'next/server';
import { errorResponse, response } from '@/shared/errors';
import { authorizedMutation } from '@/shared/session';
import { retryEnrollment } from '@/modules/reap-payments/enrollments';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await authorizedMutation(request);
    return response(await retryEnrollment((await context.params).id));
  } catch (error) { return errorResponse(error); }
}
