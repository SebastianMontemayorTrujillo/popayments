import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReapClient, reapMoney } from '@/modules/reap-payments/client';

const saved = { REAP_BASE_URL: process.env.REAP_BASE_URL, REAP_API_KEY: process.env.REAP_API_KEY,
  REAP_VERSION: process.env.REAP_VERSION, REAP_KEY_EXPIRES_AT: process.env.REAP_KEY_EXPIRES_AT };
afterEach(() => { for (const [key, value] of Object.entries(saved)) {
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
} });
function config() {
  process.env.REAP_BASE_URL = 'https://sg.sandbox.api.reap.global';
  process.env.REAP_API_KEY = 'fixture-secret';
  process.env.REAP_VERSION = '2025-02-14';
  process.env.REAP_KEY_EXPIRES_AT = '2099-01-01T00:00:00Z';
}

describe('Reap sandbox client', () => {
  it('sends an EXTERNAL enrollment with a stable idempotency key and never card data', async () => {
    config();
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'en-1', status: 'REQUIRES_ACTION',
      nextAction: { type: 'REDIRECT', url: 'https://pay.reap.global/approve' }, source: 'EXTERNAL', owner: {} }));
    const result = await new ReapClient(send).createExternalEnrollment({ ownerId: 'owner', email: 'owner@example.com',
      returnUrl: 'https://sandbox.example/return', idempotencyKey: 'fixed-key' });
    expect(result.status).toBe('REQUIRES_ACTION');
    const [url, request] = send.mock.calls[0];
    if (!request) throw new Error('Faltan opciones HTTP');
    expect(url).toBe('https://sg.sandbox.api.reap.global/agentic/enrollments');
    expect((request.headers as Record<string,string>)['Idempotency-Key']).toBe('fixed-key');
    expect(JSON.parse(String(request.body))).toEqual({ source: 'EXTERNAL', owner: { type: 'CLIENT_REFERENCE', id: 'owner', email: 'owner@example.com' },
      presentation: { type: 'REDIRECT', returnUrl: 'https://sandbox.example/return' } });
  });

  it('blocks mutations after key expiry before sending a request', async () => {
    config(); process.env.REAP_KEY_EXPIRES_AT = '2000-01-01T00:00:00Z';
    const send = vi.fn<typeof fetch>();
    await expect(new ReapClient(send).createCheckout({ quoteId: 'q', enrollmentId: 'e', returnUrl: 'https://sandbox.example/return', idempotencyKey: 'fixed-key' }))
      .rejects.toMatchObject({ code: 'REAP_KEY_EXPIRED' });
    expect(send).not.toHaveBeenCalled();
  });

  it('converts decimal amounts exactly and rejects extra decimals', () => {
    expect(reapMoney({ amount: 1.25, currency: 'MXN' })).toEqual({ currency: 'MXN', minorUnits: '125' });
    expect(() => reapMoney({ amount: 1.255, currency: 'MXN' })).toThrow();
  });
});
