import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse, response } from '@/shared/errors';
import { jsonInput } from '@/shared/http-validation';
import { authorizedMutation } from '@/shared/session';
import { ReapClient } from '@/modules/reap-payments/client';

export async function POST(request: NextRequest) {
  try {
    await authorizedMutation(request);
    const input = await jsonInput(request, z.strictObject({ query: z.string().trim().min(2).max(100) }));
    return response(await new ReapClient().searchActeck(input.query));
  } catch (error) { return errorResponse(error); }
}
