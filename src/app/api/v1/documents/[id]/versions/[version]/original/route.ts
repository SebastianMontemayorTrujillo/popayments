import type { NextRequest } from 'next/server';
import { AppError, errorResponse } from '@/shared/errors';
import { authenticated } from '@/shared/session';
import { getDocumentVersion } from '@/modules/documents/repository';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; version: string }> }) {
  try {
    await authenticated(request);
    const { id, version } = await context.params;
    if (!/^[1-9]\d*$/.test(version)) throw new AppError(400, 'INVALID_VERSION', 'Versión inválida');
    const found = await getDocumentVersion(id, Number(version));
    if (!found) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Documento no encontrado');
    return new Response(new Uint8Array(found.original), {
      headers: {
        'Content-Type': found.format === 'json' ? 'application/json; charset=utf-8' : 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="document-${id}-v${version}.${found.format}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) { return errorResponse(error); }
}
