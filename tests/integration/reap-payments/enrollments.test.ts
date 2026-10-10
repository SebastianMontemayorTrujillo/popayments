import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { database } from '@/shared/database';
import { ReapClient } from '@/modules/reap-payments/client';
import { createExternalEnrollment, getEnrollment } from '@/modules/reap-payments/enrollments';

const ownerId = randomUUID();
const saved = { REAP_OWNER_ID: process.env.REAP_OWNER_ID, REAP_OWNER_EMAIL: process.env.REAP_OWNER_EMAIL,
  APP_BASE_URL: process.env.APP_BASE_URL, REAP_BASE_URL: process.env.REAP_BASE_URL,
  REAP_API_KEY: process.env.REAP_API_KEY, REAP_VERSION: process.env.REAP_VERSION,
  REAP_KEY_EXPIRES_AT: process.env.REAP_KEY_EXPIRES_AT };

describe.runIf(Boolean(process.env.DATABASE_URL))('enrollment Reap persistente', () => {
  afterAll(async () => {
    await database().query('DELETE FROM reap_enrollments WHERE owner_id=$1', [ownerId]);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  it('conserva solicitud e idempotencia y solo marca ACTIVE tras consulta', async () => {
    process.env.REAP_OWNER_ID = ownerId;
    process.env.REAP_OWNER_EMAIL = 'owner@example.com';
    process.env.APP_BASE_URL = 'https://demo.example';
    process.env.REAP_BASE_URL = 'https://sg.sandbox.api.reap.global';
    process.env.REAP_API_KEY = 'fixture-secret';
    process.env.REAP_VERSION = '2025-02-14';
    process.env.REAP_KEY_EXPIRES_AT = '2099-01-01T00:00:00Z';
    const card = { type: 'CARD', network: 'VISA', last4: '1234', expiryMonth: 12, expiryYear: 2030 };
    const send = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'provider-en-1', status: 'REQUIRES_ACTION',
        nextAction: { type: 'REDIRECT', url: 'https://pay.reap.global/card' }, owner: {}, source: 'EXTERNAL' }))
      .mockResolvedValueOnce(Response.json({ id: 'provider-en-1', status: 'ACTIVE', nextAction: null, owner: {},
        paymentMethod: { ...card, unexpectedSecret: 'must-not-be-stored' } }));
    const client = new ReapClient(send);
    const key = randomUUID();
    const created = await createExternalEnrollment(key, client);
    expect(created.status).toBe('REQUIRES_ACTION');
    expect((await createExternalEnrollment(key, client)).id).toBe(created.id);
    expect(send).toHaveBeenCalledTimes(1);
    const active = await getEnrollment(created.id, true, client);
    expect(active.status).toBe('ACTIVE');
    expect(active.paymentMethod).toEqual(card);
    expect((await getEnrollment(created.id)).paymentMethod).toEqual(card);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
