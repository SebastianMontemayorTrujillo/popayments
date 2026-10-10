import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { canonicalHash } from '@/shared/canonical-json';
import { AppError, errorResponse } from '@/shared/errors';
import { idempotent } from '@/shared/http-idempotency';
import { documentRefSchema, jsonInput } from '@/shared/http-validation';
import { authorizedMutation } from '@/shared/session';
import { getCase } from '@/modules/payment-workflow/cases';
import { reconcileCase } from '@/modules/reconciliation/service';

export async function POST(request: NextRequest) {
  try {
    const user = await authorizedMutation(request);
    const body = await jsonInput(request, z.strictObject({ caseId: z.uuid(), po: documentRefSchema, invoice: documentRefSchema }));
    const current = await getCase(body.caseId);
    if (canonicalHash(current.po) !== canonicalHash(body.po) || canonicalHash(current.invoice) !== canonicalHash(body.invoice)) {
      throw new AppError(409, 'STALE_DOCUMENTS', 'Los documentos vinculados cambiaron');
    }
    return idempotent(user.actorId, `reconcile:${body.caseId}`, request.headers.get('idempotency-key'), canonicalHash(body),
      async () => ({ status: 201, data: await reconcileCase(body.caseId) }));
  } catch (error) { return errorResponse(error); }
}
