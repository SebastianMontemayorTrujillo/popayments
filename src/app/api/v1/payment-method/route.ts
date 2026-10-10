import type { NextRequest } from 'next/server';
import { getDefaultCard } from '@/modules/reap-payments/default-card';
import { errorResponse, response } from '@/shared/errors';
import { authenticated } from '@/shared/session';

export async function GET(request: NextRequest) {
  try {
    await authenticated(request);
    return response(await getDefaultCard());
  } catch (error) { return errorResponse(error); }
}
