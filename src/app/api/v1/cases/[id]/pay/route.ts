import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { AppError, errorResponse, response } from '@/shared/errors';
import { jsonInput } from '@/shared/http-validation';
import { authorizedMutation } from '@/shared/session';
import { getPaymentGrant } from '@/modules/authorization/service';
import { executePayment } from '@/modules/reap-payments/payments';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await authorizedMutation(request);
    const { id } = await context.params;
    const body = await jsonInput(request, z.strictObject({ grantId: z.uuid(), evidenceId: z.uuid() }));
    const grant = await getPaymentGrant(body.grantId);
    if (grant.caseId !== id) throw new AppError(404, 'GRANT_NOT_FOUND', 'Permiso no encontrado');
    return response(await executePayment(body.grantId, body.evidenceId), 202);
  } catch (error) { return errorResponse(error); }
}
