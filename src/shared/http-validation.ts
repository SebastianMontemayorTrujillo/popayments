import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { AppError } from './errors';

export async function jsonInput<T extends z.ZodType>(request: NextRequest, schema: T): Promise<z.output<T>> {
  let value: unknown;
  try { value = await request.json(); }
  catch { throw new AppError(400, 'INVALID_JSON', 'Cuerpo JSON inválido'); }
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError(422, 'INVALID_INPUT', 'Datos inválidos', result.error.issues.map((item) => ({ field: item.path.join('.'), reason: item.message })));
  return result.data;
}

export const documentRefSchema = z.strictObject({
  documentId: z.uuid(),
  version: z.number().int().positive(),
  sourceHash: z.string().min(20),
  canonicalHash: z.string().min(20),
});
