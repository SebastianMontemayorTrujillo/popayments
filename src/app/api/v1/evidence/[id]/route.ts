import type { NextRequest } from 'next/server';
import { errorResponse, response } from '@/shared/errors';
import { authenticated } from '@/shared/session';
import { getEvidence } from '@/modules/ap2-evidence/service';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await authenticated(request);
    const evidence = await getEvidence((await context.params).id);
    return response({ id: evidence.id, profile: evidence.profile, grantId: evidence.grantId,
      quoteId: evidence.quoteId, checkoutHash: evidence.checkoutHash, verified: Boolean(evidence.verificationReceipt) });
  } catch (error) { return errorResponse(error); }
}
