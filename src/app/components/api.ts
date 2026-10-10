export interface ApiReply<T> { data: T; requestId: string }

export async function readApi<T>(path: string): Promise<T> {
  const result = await fetch(path, { cache: 'no-store' });
  const body = await result.json();
  if (!result.ok) throw new Error(body.error?.message ?? 'No se pudo consultar');
  return (body as ApiReply<T>).data;
}

export async function sendApi<T>(path: string, method: 'POST' | 'DELETE', body?: object | FormData): Promise<T> {
  const session = await readApi<{ csrfToken: string }>('/api/v1/session');
  const result = await fetch(path, {
    method,
    headers: {
      'x-csrf-token': session.csrfToken,
      'idempotency-key': crypto.randomUUID(),
      ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (result.status === 204) return undefined as T;
  const reply = await result.json();
  if (!result.ok) throw new Error(reply.error?.message ?? 'No se pudo completar la acción');
  return (reply as ApiReply<T>).data;
}
