import { createHash, randomBytes, sign, verify } from 'node:crypto';
import { SDJwtInstance } from '@sd-jwt/core';
import { SignJWT, jwtVerify } from 'jose';
import { canonicalHash } from '@/shared/canonical-json';
import { AppError } from '@/shared/errors';
import type { Keyring } from './keys';

const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('base64url');
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const decode = (value: string): unknown => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
const now = () => Math.floor(Date.now() / 1000);

export interface MandateContent {
  vct: 'mandate.checkout.open.1' | 'mandate.payment.open.1' | 'mandate.checkout.1' | 'mandate.payment.1';
  iat: number; exp: number;
  cnf?: { jwk: JsonWebKey };
  constraints?: unknown[];
  [key: string]: unknown;
}

function coreVerifier(keys: Keyring) {
  return new SDJwtInstance({ signAlg: 'ES256', hashAlg: 'sha-256',
    signer: async (data) => sign('sha256', Buffer.from(data), { key: keys['demo-trusted-provider'].privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url'),
    verifier: async (data, signature) => verify('sha256', Buffer.from(data),
      { key: keys['demo-trusted-provider'].publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')),
    hasher: async (data) => new Uint8Array(createHash('sha256').update(
      typeof data === 'string' ? Buffer.from(data) : Buffer.from(data as ArrayBuffer)).digest()),
    saltGenerator: async () => randomBytes(16).toString('base64url') });
}

export async function issueOpenMandate(content: MandateContent, keys: Keyring): Promise<string> {
  if (!content.vct.endsWith('.open.1') || !content.cnf || canonicalHash(content.cnf.jwk) !== canonicalHash(keys['demo-agent'].jwk)) {
    throw new AppError(422, 'INVALID_OPEN_MANDATE', 'El mandato abierto debe vincular la clave del agente');
  }
  if (content.exp <= now() || content.iat > now() + 60) throw new AppError(422, 'INVALID_OPEN_MANDATE', 'Vigencia inválida');
  const disclosure = encode([randomBytes(16).toString('base64url'), content]);
  const issuer = await new SignJWT({ iss: 'demo-trusted-provider', iat: content.iat, exp: content.exp,
    delegate_payload: [{ '...': hash(disclosure) }], _sd_alg: 'sha-256' })
    .setProtectedHeader({ alg: 'ES256', typ: 'dc+sd-jwt', kid: 'demo-trusted-provider' })
    .sign(keys['demo-trusted-provider'].privateKey);
  return `${issuer}~${disclosure}~`;
}

export async function verifyOpenMandate(token: string, vct: MandateContent['vct'], keys: Keyring): Promise<MandateContent> {
  if (!/^mandate\.(checkout|payment)\.open\.1$/.test(vct)) throw new AppError(422, 'INVALID_MANDATE_TYPE', 'Tipo de mandato inválido');
  const parts = token.split('~');
  if (parts.length !== 3 || !parts[0] || !parts[1] || parts[2] !== '') throw new AppError(422, 'INVALID_SD_JWT', 'Serialización SD-JWT inválida');
  const verified = await coreVerifier(keys).verify(token, { allowedIssuerAlgorithms: ['ES256'] });
  if (verified.header?.alg !== 'ES256' || verified.header.kid !== 'demo-trusted-provider' || verified.header.typ !== 'dc+sd-jwt') {
    throw new AppError(422, 'UNTRUSTED_ISSUER', 'Emisor de prueba desconocido');
  }
  const payload = verified.payload as Record<string, unknown>;
  if (payload.iss !== 'demo-trusted-provider' || typeof payload.exp !== 'number' || payload.exp <= now() ||
      !Array.isArray(payload.delegate_payload) || payload.delegate_payload.length !== 1) {
    throw new AppError(422, 'INVALID_SD_JWT', 'El mandato abierto no está vigente');
  }
  const content = payload.delegate_payload[0] as MandateContent;
  if (!content || content.vct !== vct || typeof content.exp !== 'number' || content.exp <= now() || content.exp > payload.exp ||
      !content.cnf || canonicalHash(content.cnf.jwk) !== canonicalHash(keys['demo-agent'].jwk)) {
    throw new AppError(422, 'INVALID_OPEN_MANDATE', 'Restricciones del mandato abierto inválidas');
  }
  return content;
}

export async function issueDelegatedMandate(openToken: string, closed: MandateContent, audience: string,
  nonce: string, keys: Keyring): Promise<string> {
  const openVct = closed.vct === 'mandate.checkout.1' ? 'mandate.checkout.open.1' : 'mandate.payment.open.1';
  const open = await verifyOpenMandate(openToken, openVct, keys);
  if (closed.exp > open.exp || closed.exp <= now() || !audience || !nonce) throw new AppError(422, 'DELEGATION_EXPIRED', 'Delegación inválida');
  const disclosure = encode([randomBytes(16).toString('base64url'), closed]);
  const kb = await new SignJWT({ iss: 'demo-agent', aud: audience, nonce, iat: now(), exp: closed.exp,
    sd_hash: hash(openToken), delegate_payload: [{ '...': hash(disclosure) }] })
    .setProtectedHeader({ alg: 'ES256', typ: 'kb+sd-jwt', kid: 'demo-agent' })
    .sign(keys['demo-agent'].privateKey);
  return `${openToken}~${kb}~${disclosure}~`;
}

export async function verifyDelegatedMandate(token: string, expectedVct: MandateContent['vct'], audience: string,
  nonce: string, keys: Keyring): Promise<{ open: MandateContent; closed: MandateContent }> {
  const parts = token.split('~');
  if (parts.length !== 6 || !parts[0] || !parts[1] || parts[2] !== '' || !parts[3] || !parts[4] || parts[5] !== '') {
    throw new AppError(422, 'INVALID_DELEGATION', 'Serialización delegada inválida');
  }
  const openToken = `${parts[0]}~${parts[1]}~`;
  const openVct = expectedVct === 'mandate.checkout.1' ? 'mandate.checkout.open.1' : 'mandate.payment.open.1';
  const open = await verifyOpenMandate(openToken, openVct, keys);
  const { payload, protectedHeader } = await jwtVerify(parts[3], keys['demo-agent'].publicKey,
    { algorithms: ['ES256'], audience, issuer: 'demo-agent' });
  if (protectedHeader.typ !== 'kb+sd-jwt' || protectedHeader.kid !== 'demo-agent' ||
      payload.sd_hash !== hash(openToken) || payload.nonce !== nonce) throw new AppError(422, 'INVALID_DELEGATION', 'Vínculo delegado inválido');
  const delegated = payload.delegate_payload;
  if (!Array.isArray(delegated) || delegated.length !== 1 || typeof delegated[0] !== 'object' ||
      (delegated[0] as Record<string, unknown>)['...'] !== hash(parts[4])) {
    throw new AppError(422, 'INVALID_DELEGATION', 'Divulgación delegada inválida');
  }
  const disclosure = decode(parts[4]);
  if (!Array.isArray(disclosure) || disclosure.length !== 2 || typeof disclosure[0] !== 'string' ||
      Buffer.from(disclosure[0], 'base64url').length < 16 || typeof disclosure[1] !== 'object' || !disclosure[1]) {
    throw new AppError(422, 'INVALID_DELEGATION', 'Contenido delegado inválido');
  }
  const closed = disclosure[1] as MandateContent;
  if (closed.vct !== expectedVct || typeof closed.exp !== 'number' || closed.exp <= now() || closed.exp > open.exp) {
    throw new AppError(422, 'INVALID_DELEGATION', 'Mandato cerrado vencido o de otro tipo');
  }
  return { open, closed };
}

export function checkoutHash(checkoutJwt: string): string { return hash(checkoutJwt); }
