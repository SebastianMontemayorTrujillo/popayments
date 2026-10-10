import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

export class AppError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details: unknown = null) {
    super(message);
  }
}

export function response<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data, requestId: randomUUID() }, { status });
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, details: error.details }, requestId: randomUUID() }, { status: error.status });
  }
  return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado', details: null }, requestId: randomUUID() }, { status: 500 });
}
