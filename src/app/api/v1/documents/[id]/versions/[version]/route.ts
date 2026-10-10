import type { NextRequest } from 'next/server';
import { AppError, errorResponse, response } from '@/shared/errors';
import { authenticated } from '@/shared/session';
import { getDocumentVersion } from '@/modules/documents/repository';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; version: string }> }) {
  try {
    await authenticated(request);
    const { id, version } = await context.params;
    if (!/^[1-9]\d*$/.test(version)) throw new AppError(400, 'INVALID_VERSION', 'Versión inválida');
    const found = await getDocumentVersion(id, Number(version));
    if (!found) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Documento no encontrado');
    const { original: _original, ...view } = found;
    void _original;
    return response(view);
  } catch (error) { return errorResponse(error); }
}
