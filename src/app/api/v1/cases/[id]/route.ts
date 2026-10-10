import type { NextRequest } from 'next/server';
import { errorResponse, response } from '@/shared/errors';
import { authenticated } from '@/shared/session';
import { getCase } from '@/modules/payment-workflow/cases';
import { latestReconciliationForCase } from '@/modules/reconciliation/service';
import { getReviewForCase, latestPaymentGrant, latestPurchaseAuthorization } from '@/modules/authorization/service';
import { latestPurchasePlan } from '@/modules/reap-payments/plans';
import { latestQuote } from '@/modules/reap-payments/quotes';
import { latestEvidence } from '@/modules/ap2-evidence/service';
import { latestPayment } from '@/modules/reap-payments/payments';
import { latestAgentRun } from '@/modules/payment-workflow/agent';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await authenticated(request);
    const { id } = await context.params;
    const [summary, reconciliation] = await Promise.all([getCase(id), latestReconciliationForCase(id)]);
    const [review, authorization, grant, purchasePlan, quote, evidence, payment, agent] = await Promise.all([
      getReviewForCase(id, reconciliation?.id), latestPurchaseAuthorization(id), latestPaymentGrant(id), latestPurchasePlan(id), latestQuote(id), latestEvidence(id), latestPayment(id), latestAgentRun(id),
    ]);
    return response({ ...summary, reconciliation, review, authorization, grant, purchasePlan, quote, evidence, payment, agent });
  } catch (error) { return errorResponse(error); }
}
