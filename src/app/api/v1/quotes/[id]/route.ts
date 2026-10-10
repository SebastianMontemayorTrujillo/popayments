import type { NextRequest } from 'next/server';
import { errorResponse, response } from '@/shared/errors';
import { authenticated } from '@/shared/session';
import { getQuote } from '@/modules/reap-payments/quotes';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { await authenticated(request); return response(await getQuote((await context.params).id, true)); }
  catch (error) { return errorResponse(error); }
}
