import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { canonicalHash } from '@/shared/canonical-json';
import { AppError, errorResponse } from '@/shared/errors';
import { idempotent } from '@/shared/http-idempotency';
import { jsonInput } from '@/shared/http-validation';
import { authorizedMutation } from '@/shared/session';
import { createPaymentGrant } from '@/modules/authorization/service';
import { latestReconciliationForCase } from '@/modules/reconciliation/service';
import { getQuote } from '@/modules/reap-payments/quotes';
import { enqueueAgentRun } from '@/modules/payment-workflow/jobs';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authorizedMutation(request);
    const { id } = await context.params;
    const body = await jsonInput(request, z.strictObject({ quoteId: z.uuid(),
      mode: z.enum(['AUTO','AUTHORIZE_EXCEPTION','AUTHORIZE_QUOTE_CHANGE']), justification: z.string().optional() }));
    return idempotent(user.actorId, `grant:${id}`, request.headers.get('idempotency-key'), canonicalHash(body), async () => {
      const [reconciliation, quote] = await Promise.all([latestReconciliationForCase(id), getQuote(body.quoteId, true)]);
      if (!reconciliation || quote.caseId !== id || !quote.snapshot || quote.status !== 'READY') {
        throw new AppError(409, 'PAYMENT_NOT_READY', 'Faltan conciliación o cotización vigente');
      }
      const granted = await createPaymentGrant({ caseId: id, reconciliationId: reconciliation.id, quote: quote.snapshot,
        mode: body.mode, actorId: user.actorId, justification: body.justification });
      await enqueueAgentRun(id);
      return { status: 201, data: granted };
    });
  } catch (error) { return errorResponse(error); }
}
