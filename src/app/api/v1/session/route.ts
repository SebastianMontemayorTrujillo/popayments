import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AppError, errorResponse, response } from '@/shared/errors';
import { authenticated, authorizedMutation, checkLoginLimit, checkOrigin, createSession, csrfForToken, lookupUser, revokeSession, sessionCookie, verifyPassword } from '@/shared/session';

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const body = await request.json() as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) throw new AppError(400, 'INVALID_LOGIN', 'Escribe correo y contraseña');
    checkLoginLimit(`${request.headers.get('x-forwarded-for') ?? 'local'}:${email}`);
    const user = await lookupUser(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) throw new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos');
    const { token, expiresAt } = await createSession(user.id);
    const result = response({ actorId: user.id, email, csrfToken: csrfForToken(token) });
    result.cookies.set(sessionCookie(token, expiresAt));
    return result;
  } catch (error) { return errorResponse(error); }
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticated(request);
    return response({ actorId: user.actorId, email: user.email, csrfToken: csrfForToken(user.token) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authorizedMutation(request);
    await revokeSession(user.token);
    const result = new NextResponse(null, { status: 204 });
    result.cookies.set({ ...sessionCookie('', new Date(0)), maxAge: 0 });
    return result;
  } catch (error) { return errorResponse(error); }
}
