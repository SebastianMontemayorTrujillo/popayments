import type { NextRequest } from 'next/server';
import { canonicalHash } from '@/shared/canonical-json';
import { errorResponse } from '@/shared/errors';
import { idempotent } from '@/shared/http-idempotency';
import { authorizedMutation } from '@/shared/session';
import { uploadedDocument } from '@/modules/documents/http';
import { createDocument } from '@/modules/documents/repository';

export async function POST(request: NextRequest) {
  try {
    const user = await authorizedMutation(request);
    const { original, parsed } = await uploadedDocument(request);
    return idempotent(user.actorId, 'documents:create', request.headers.get('idempotency-key'),
      canonicalHash([parsed.sourceHash, parsed.data.kind]),
      async () => ({ status: 201, data: await createDocument(parsed, original, user.actorId) }));
  } catch (error) { return errorResponse(error); }
}
