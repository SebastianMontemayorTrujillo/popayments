import { z } from 'zod';
import { AppError } from '@/shared/errors';
import type { Money } from '@/shared/money';

const money = z.strictObject({ amount: z.number().finite().nonnegative(), currency: z.enum(['MXN', 'USD']) });
const action = z.strictObject({ type: z.literal('REDIRECT'), url: z.url().refine((value) => {
  const host = new URL(value).hostname;
  return value.startsWith('https://') && (host === 'reap.global' || host.endsWith('.reap.global'));
}), expiresAt: z.string().optional() }).nullable();
const checkout = z.object({
  id: z.string().min(1), status: z.enum(['REQUIRES_ACTION', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED']),
  quoteId: z.string().min(1), enrollmentId: z.string().nullable(), nextAction: action,
  orderId: z.string().nullable().optional(), finalAmount: money.optional(), amount: money.optional(),
});
const enrollment = z.object({ id: z.string().min(1), status: z.string(), nextAction: action.optional(), owner: z.unknown().optional(), paymentMethod: z.unknown().optional() });
const quote = z.object({ id: z.string().min(1), expiresAt: z.iso.datetime({ offset: true }), amountBreakdown: z.object({ finalAmount: money }), shippingOptions: z.array(z.unknown()) });

export type ReapCheckout = z.infer<typeof checkout>;
export type ReapEnrollment = z.infer<typeof enrollment>;
export type ReapQuote = z.infer<typeof quote>;

export function reapMoney(value: z.infer<typeof money>): Money {
  const written = String(value.amount);
  if (!/^\d+(?:\.\d{1,2})?$/.test(written)) throw new AppError(502, 'INVALID_REAP_AMOUNT', 'Reap devolvió un importe no representable');
  const [units, fraction = ''] = written.split('.');
  return { currency: value.currency, minorUnits: (BigInt(units) * 100n + BigInt(fraction.padEnd(2, '0'))).toString() };
}

export class ReapClient {
  constructor(private readonly send: typeof fetch = fetch) {}

  private config(mutate: boolean) {
    const base = process.env.REAP_BASE_URL ?? '';
    const key = process.env.REAP_API_KEY ?? '';
    const version = process.env.REAP_VERSION ?? '';
    const expiry = process.env.REAP_KEY_EXPIRES_AT ?? '';
    if (base !== 'https://sg.sandbox.api.reap.global' || !key || version !== '2025-02-14') {
      throw new AppError(503, 'REAP_NOT_CONFIGURED', 'Configura la API sandbox de Reap');
    }
    if (mutate && (!expiry || !Number.isFinite(Date.parse(expiry)) || Date.now() >= Date.parse(expiry))) {
      throw new AppError(503, 'REAP_KEY_EXPIRED', 'La llave sandbox de Reap venció');
    }
    return { base, key, version };
  }

  private async request(path: string, method: 'GET' | 'POST', body?: unknown, idempotencyKey?: string): Promise<unknown> {
    const { base, key, version } = this.config(Boolean(idempotencyKey));
    const headers: Record<string, string> = { Authorization: `Bearer ${key}`, 'Reap-Version': version, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    let response: Response;
    try {
      response = await this.send(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new AppError(503, 'REAP_RESULT_UNKNOWN', 'No se pudo confirmar el resultado de Reap');
    }
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? 'REAP_ACCESS_DENIED' : response.status >= 500 ? 'REAP_RESULT_UNKNOWN' : 'REAP_REQUEST_REJECTED';
      throw new AppError(response.status >= 500 ? 503 : 422, code, `Reap respondió con HTTP ${response.status}`);
    }
    try { return await response.json(); }
    catch { throw new AppError(502, 'INVALID_REAP_RESPONSE', 'Reap devolvió una respuesta inválida'); }
  }

  async createExternalEnrollment(input: { ownerId: string; email: string; returnUrl: string; idempotencyKey: string }): Promise<ReapEnrollment> {
    if (!input.returnUrl.startsWith('https://')) throw new AppError(422, 'HTTPS_REQUIRED', 'El retorno de Reap requiere HTTPS');
    return enrollment.parse(await this.request('/agentic/enrollments', 'POST', {
      source: 'EXTERNAL', owner: { type: 'CLIENT_REFERENCE', id: input.ownerId, email: input.email },
      presentation: { type: 'REDIRECT', returnUrl: input.returnUrl },
    }, input.idempotencyKey));
  }

  async getEnrollment(id: string): Promise<ReapEnrollment> {
    return enrollment.parse(await this.request(`/agentic/enrollments/${encodeURIComponent(id)}`, 'GET'));
  }

  async searchActeck(query: string): Promise<unknown> {
    return this.request('/agentic/products/search', 'POST', { query, merchantPreference: { mode: 'ONLY', merchantName: 'Acteck' } });
  }

  async createQuote(input: { email: string; items: { variantId: string; quantity: number }[]; shippingAddress: Record<string, string>; idempotencyKey: string }): Promise<ReapQuote> {
    if (!input.items.length || input.items.length > 20 || input.items.some((item) => !item.variantId || !Number.isSafeInteger(item.quantity) || item.quantity < 1)) {
      throw new AppError(422, 'INVALID_ITEMS', 'Selecciona entre 1 y 20 variantes válidas');
    }
    return quote.parse(await this.request('/agentic/quotes', 'POST', { email: input.email, items: input.items, shippingAddress: input.shippingAddress }, input.idempotencyKey));
  }

  async getQuote(id: string): Promise<ReapQuote> {
    return quote.parse(await this.request(`/agentic/quotes/${encodeURIComponent(id)}`, 'GET'));
  }

  async createCheckout(input: { quoteId: string; enrollmentId: string; returnUrl: string; idempotencyKey: string }): Promise<ReapCheckout> {
    if (!input.returnUrl.startsWith('https://')) throw new AppError(422, 'HTTPS_REQUIRED', 'El retorno de Reap requiere HTTPS');
    return checkout.parse(await this.request('/agentic/checkouts', 'POST', { quoteId: input.quoteId, enrollmentId: input.enrollmentId,
      presentation: { type: 'REDIRECT', returnUrl: input.returnUrl } }, input.idempotencyKey));
  }

  async getCheckout(id: string): Promise<ReapCheckout> {
    return checkout.parse(await this.request(`/agentic/checkouts/${encodeURIComponent(id)}`, 'GET'));
  }
}
