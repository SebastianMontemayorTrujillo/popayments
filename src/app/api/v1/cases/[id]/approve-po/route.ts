import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { canonicalHash } from '@/shared/canonical-json';
import { AppError, errorResponse } from '@/shared/errors';
import { idempotent } from '@/shared/http-idempotency';
import { jsonInput } from '@/shared/http-validation';
import { authorizedMutation } from '@/shared/session';
import { approvePurchase } from '@/modules/authorization/service';
import { getCase } from '@/modules/payment-workflow/cases';
import { getEnrollment, listEnrollments } from '@/modules/reap-payments/enrollments';
import { getPurchasePlan } from '@/modules/reap-payments/plans';
import { enqueueAgentRun } from '@/modules/payment-workflow/jobs';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authorizedMutation(request);
    const { id } = await context.params;
    const body = await jsonInput(request, z.strictObject({ expectedCaseVersion: z.number().int().positive(), planId: z.uuid(), enrollmentId: z.uuid() }));
    return idempotent(user.actorId, `approve-po:${id}`, request.headers.get('idempotency-key'), canonicalHash(body), async () => {
      const [current, plan, enrollments] = await Promise.all([getCase(id), getPurchasePlan(body.planId), listEnrollments()]);
      if (!current.po || plan.caseId !== id || !enrollments.some((enrollment) => enrollment.id === body.enrollmentId)) {
        throw new AppError(422, 'INVALID_PURCHASE_CONTEXT', 'PO, plan o instrumento no corresponden al caso');
      }
      const enrollment = await getEnrollment(body.enrollmentId, true);
      if (!enrollment.providerId || enrollment.status !== 'ACTIVE') throw new AppError(409, 'ENROLLMENT_NOT_ACTIVE', 'Completa el registro de la tarjeta en Reap');
      const approved = await approvePurchase({ caseId: id, expectedCaseVersion: body.expectedCaseVersion, po: current.po,
        plan: { id: plan.id, po: plan.po, hash: plan.hash, merchantId: plan.merchantId },
        enrollment: { id: enrollment.providerId, status: 'ACTIVE' }, actorId: user.actorId });
      if (current.invoice) await enqueueAgentRun(id);
      return { status: 201, data: approved };
    });
  } catch (error) { return errorResponse(error); }
}
