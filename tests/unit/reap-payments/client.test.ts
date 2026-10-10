import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReapClient, reapMoney } from '@/modules/reap-payments/client';

const saved = { REAP_BASE_URL: process.env.REAP_BASE_URL, REAP_API_KEY: process.env.REAP_API_KEY,
  REAP_VERSION: process.env.REAP_VERSION, REAP_KEY_EXPIRES_AT: process.env.REAP_KEY_EXPIRES_AT,
  REAP_REDIRECT_ORIGINS: process.env.REAP_REDIRECT_ORIGINS };
afterEach(() => { for (const [key, value] of Object.entries(saved)) {
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
} });
function config() {
  process.env.REAP_BASE_URL = 'https://sg.sandbox.api.reap.global';
  process.env.REAP_API_KEY = 'fixture-secret';
  process.env.REAP_VERSION = '2025-02-14';
  process.env.REAP_KEY_EXPIRES_AT = '2099-01-01T00:00:00Z';
  delete process.env.REAP_REDIRECT_ORIGINS;
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

  it('returns an actionable error for an untrusted redirect without exposing its token', async () => {
    config();
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'en-1', status: 'REQUIRES_ACTION',
      nextAction: { type: 'REDIRECT', url: 'https://untrusted.example/enroll?token=private-test-token' } }));
    const failure = await new ReapClient(send).getEnrollment('en-1').catch(error => error);
    expect(failure).toMatchObject({ status: 502, code: 'REAP_REDIRECT_NOT_ALLOWED' });
    expect(failure.message).not.toContain('private-test-token');
    expect(failure.details).toBeNull();
  });

  it('accepts the exact configured sandbox origin returned by Reap for enrollment and checkout', async () => {
    config();
    process.env.REAP_REDIRECT_ORIGINS = 'https://sandbox.collect.prava.space';
    const nextAction = { type: 'REDIRECT', url: 'https://sandbox.collect.prava.space/enroll?token=fixture', expiresAt: '2099-01-01T00:00:00Z' };
    const send = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'en-1', status: 'REQUIRES_ACTION', nextAction }))
      .mockResolvedValueOnce(Response.json({ id: 'en-1', status: 'REQUIRES_ACTION', nextAction }))
      .mockResolvedValueOnce(Response.json({ id: 'co-1', status: 'REQUIRES_ACTION', quoteId: 'q-1', enrollmentId: 'en-1', nextAction }))
      .mockResolvedValueOnce(Response.json({ id: 'co-1', status: 'REQUIRES_ACTION', quoteId: 'q-1', enrollmentId: 'en-1', nextAction }));
    const client = new ReapClient(send);
    expect((await client.createExternalEnrollment({ ownerId: 'owner', email: 'owner@example.com', returnUrl: 'https://demo.example/return', idempotencyKey: 'existing-key' })).nextAction).toEqual(nextAction);
    expect((await client.getEnrollment('en-1')).nextAction).toEqual(nextAction);
    expect((await client.createCheckout({ quoteId: 'q-1', enrollmentId: 'en-1', returnUrl: 'https://demo.example/return', idempotencyKey: 'checkout-key' })).nextAction).toEqual(nextAction);
    expect((await client.getCheckout('co-1')).nextAction).toEqual(nextAction);
  });

  it.each([
    'http://sandbox.collect.prava.space/enroll',
    'https://sandbox.collect.prava.space.evil.example/enroll',
    'https://evil.sandbox.collect.prava.space/enroll',
    'https://sandbox.collect.prava.space:8443/enroll',
    'https://sandbox.collect.prava.space@evil.example/enroll',
    'https://attacker@sandbox.collect.prava.space/enroll',
    'https://pay.reap.global.evil.example/enroll',
    'https://attacker@pay.reap.global/enroll',
    'not-a-url',
  ])('rejects an unsafe redirect despite a configured origin: %s', async (url) => {
    config();
    process.env.REAP_REDIRECT_ORIGINS = 'https://sandbox.collect.prava.space';
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'en-1', status: 'REQUIRES_ACTION',
      nextAction: { type: 'REDIRECT', url } }));
    await expect(new ReapClient(send).getEnrollment('en-1')).rejects.toMatchObject({ code: 'REAP_REDIRECT_NOT_ALLOWED' });
  });

  it('requires explicit configuration before trusting the external sandbox origin', async () => {
    config();
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'en-1', status: 'REQUIRES_ACTION',
      nextAction: { type: 'REDIRECT', url: 'https://sandbox.collect.prava.space/enroll' } }));
    await expect(new ReapClient(send).getEnrollment('en-1')).rejects.toMatchObject({ code: 'REAP_REDIRECT_NOT_ALLOWED' });
  });

  it('converts decimal amounts exactly and rejects extra decimals', () => {
    expect(reapMoney({ amount: 1.25, currency: 'MXN' })).toEqual({ currency: 'MXN', minorUnits: '125' });
    expect(() => reapMoney({ amount: 1.255, currency: 'MXN' })).toThrow();
  });
});
