import type { NextRequest } from 'next/server';
import { errorResponse, response } from '@/shared/errors';
import { authenticated } from '@/shared/session';
import { getPayment } from '@/modules/reap-payments/payments';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { await authenticated(request); return response(await getPayment((await context.params).id)); }
  catch (error) { return errorResponse(error); }
}
