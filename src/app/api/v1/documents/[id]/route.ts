import type { NextRequest } from 'next/server';
import { AppError, errorResponse, response } from '@/shared/errors';
import { authenticated } from '@/shared/session';
import { getDocumentVersion } from '@/modules/documents/repository';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await authenticated(request);
    const { id } = await context.params;
    const found = await getDocumentVersion(id);
    if (!found) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Documento no encontrado');
    const { original: _original, ...view } = found;
    void _original;
    return response(view);
  } catch (error) { return errorResponse(error); }
}
