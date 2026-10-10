import { createHash, createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextRequest } from 'next/server';
import { database } from './database';
import { AppError } from './errors';

const scrypt = promisify(scryptCallback);
const cookieName = 'popayments_session';
const attempts = new Map<string, { count: number; windowStart: number }>();

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error('La contraseña debe tener al menos 12 caracteres');
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt.toString('base64url')}:${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltText, hashText] = stored.split(':');
  if (algorithm !== 'scrypt' || !saltText || !hashText) return false;
  try {
    const expected = Buffer.from(hashText, 'base64url');
    if (expected.length !== 64) return false;
    const actual = await scrypt(password, Buffer.from(saltText, 'base64url'), 64) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch { return false; }
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET requiere al menos 32 caracteres');
  return value;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function csrfForToken(token: string): string {
  return createHmac('sha256', secret()).update(`csrf:${token}`).digest('base64url');
}

export function checkOrigin(request: NextRequest): void {
  const expected = new URL(process.env.APP_BASE_URL ?? request.nextUrl.origin).origin;
  if (request.headers.get('origin') !== expected) throw new AppError(403, 'INVALID_ORIGIN', 'Origen no permitido');
}

export function checkLoginLimit(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart >= 60_000) { attempts.set(key, { count: 1, windowStart: now }); return; }
  entry.count++;
  if (entry.count > 5) throw new AppError(429, 'LOGIN_RATE_LIMIT', 'Demasiados intentos; espera un minuto');
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1_000);
  await database().query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [tokenHash(token), userId, expiresAt]);
  return { token, expiresAt };
}

export function sessionCookie(token: string, expiresAt: Date) {
  return { name: cookieName, value: token, httpOnly: true, sameSite: 'lax' as const, secure: process.env.APP_BASE_URL?.startsWith('https://') ?? false, path: '/', expires: expiresAt };
}

export async function authenticated(request: NextRequest): Promise<{ actorId: string; email: string; token: string }> {
  const token = request.cookies.get(cookieName)?.value;
  if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión');
  return authenticatedToken(token);
}

export async function authenticatedToken(token: string): Promise<{ actorId: string; email: string; token: string }> {
  const found = await database().query<{ id: string; email: string }>(
    'SELECT u.id, u.email FROM sessions s JOIN demo_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()', [tokenHash(token)]);
  if (!found.rows[0]) throw new AppError(401, 'UNAUTHENTICATED', 'La sesión venció');
  return { actorId: found.rows[0].id, email: found.rows[0].email, token };
}

export async function authorizedMutation(request: NextRequest): Promise<{ actorId: string; email: string; token: string }> {
  checkOrigin(request);
  const user = await authenticated(request);
  const expected = csrfForToken(user.token);
  const provided = request.headers.get('x-csrf-token') ?? '';
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AppError(403, 'INVALID_CSRF', 'Token CSRF inválido');
  return user;
}

export async function revokeSession(token: string): Promise<void> {
  await database().query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(token)]);
}

export async function lookupUser(email: string): Promise<{ id: string; password_hash: string } | null> {
  const found = await database().query<{ id: string; password_hash: string }>('SELECT id,password_hash FROM demo_users WHERE email=$1', [email.toLowerCase()]);
  return found.rows[0] ?? null;
}

export function newActorId(): string { return randomUUID(); }
