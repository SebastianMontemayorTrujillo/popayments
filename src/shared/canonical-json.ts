import { createHash } from 'node:crypto';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Número no finito');
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('Valor JSON no admitido');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  const entries = Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`);
  return `{${entries.join(',')}}`;
}

export function hashBytes(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('base64url');
}

export function canonicalHash(value: unknown): string {
  return hashBytes(canonicalJson(value));
}
