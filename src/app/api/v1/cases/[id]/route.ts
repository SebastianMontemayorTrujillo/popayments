import type { NextRequest } from 'next/server';
import { errorResponse, response } from '@/shared/errors';
import { authenticated } from '@/shared/session';
import { getCase } from '@/modules/payment-workflow/cases';
import { latestReconciliationForCase } from '@/modules/reconciliation/service';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await authenticated(request);
    const { id } = await context.params;
    const [summary, reconciliation] = await Promise.all([getCase(id), latestReconciliationForCase(id)]);
    return response({ ...summary, reconciliation });
  } catch (error) { return errorResponse(error); }
}
