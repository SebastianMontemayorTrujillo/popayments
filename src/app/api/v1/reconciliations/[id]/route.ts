import type { NextRequest } from 'next/server';
import { errorResponse, response } from '@/shared/errors';
import { authenticated } from '@/shared/session';
import { getReconciliation } from '@/modules/reconciliation/service';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await authenticated(request);
    const { id } = await context.params;
    return response(await getReconciliation(id));
  } catch (error) { return errorResponse(error); }
}
