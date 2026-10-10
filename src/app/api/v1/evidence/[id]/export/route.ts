import type { NextRequest } from 'next/server';
import { errorResponse, response } from '@/shared/errors';
import { authenticated } from '@/shared/session';
import { getEvidence } from '@/modules/ap2-evidence/service';
import { loadKeyring, roles } from '@/modules/ap2-evidence/keys';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await authenticated(request);
    const evidence = await getEvidence((await context.params).id);
    const keys = await loadKeyring();
    return response({ ...evidence, trustRegistry: Object.fromEntries(roles.map((role) => [role, keys[role].jwk])) });
  } catch (error) { return errorResponse(error); }
}
