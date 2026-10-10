import { canonicalHash, hashBytes } from '@/shared/canonical-json';
import type { DocumentFormat, DocumentKind, ParsedDocument } from './contracts';
import { readJsonWithUniqueKeys } from './read-json';
import { readXml } from './read-xml';
import { documentSchema } from './schema';

export function parseDocument(bytes: Buffer, format: DocumentFormat, expectedKind: DocumentKind): ParsedDocument {
  if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('El archivo supera 2 MiB');
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const value = format === 'json' ? readJsonWithUniqueKeys(source) : readXml(source);
  const data = documentSchema.parse(value);
  if (data.kind !== expectedKind) throw new Error('El tipo del documento no coincide');
  return { data, format, sourceHash: hashBytes(bytes), canonicalHash: canonicalHash(data) };
}
