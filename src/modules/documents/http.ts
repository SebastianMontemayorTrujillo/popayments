import type { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from '@/shared/errors';
import { parseDocument } from './parse';
import type { DocumentFormat, DocumentKind } from './contracts';

export async function uploadedDocument(request: NextRequest) {
  const form = await request.formData();
  const file = form.get('file');
  const kind = form.get('kind');
  if (!(file instanceof File) || (kind !== 'PO' && kind !== 'INVOICE')) {
    throw new AppError(400, 'INVALID_UPLOAD', 'Se requieren archivo y tipo PO o INVOICE');
  }
  if (file.size > 2 * 1024 * 1024) throw new AppError(413, 'FILE_TOO_LARGE', 'El archivo supera 2 MiB');
  const format: DocumentFormat | null = /\.json$/i.test(file.name) ? 'json' : /\.xml$/i.test(file.name) ? 'xml' : null;
  if (!format) throw new AppError(400, 'INVALID_FORMAT', 'Se requiere archivo .json o .xml');
  const original = Buffer.from(await file.arrayBuffer());
  try {
    return { original, parsed: parseDocument(original, format, kind as DocumentKind) };
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError(422, 'INVALID_DOCUMENT', 'El documento no cumple el esquema', error.issues.map((item) => ({ field: item.path.join('.'), reason: item.message })));
    }
    throw new AppError(400, 'INVALID_DOCUMENT', 'El documento no se pudo leer');
  }
}
