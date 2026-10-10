import type { NextRequest } from 'next/server';
import { errorResponse, response } from '@/shared/errors';
import { authorizedMutation } from '@/shared/session';
import { refreshPayment } from '@/modules/reap-payments/payments';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { await authorizedMutation(request); return response(await refreshPayment((await context.params).id), 202); }
  catch (error) { return errorResponse(error); }
}
