import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { database } from '../../../src/shared/database';
import { hashPassword } from '../../../src/shared/session';
import { POST as login } from '../../../src/app/api/v1/session/route';
import { POST as upload } from '../../../src/app/api/v1/documents/route';
import { GET as getDocument } from '../../../src/app/api/v1/documents/[id]/route';
import { GET as getOriginal } from '../../../src/app/api/v1/documents/[id]/versions/[version]/original/route';

const actorId = randomUUID();
const email = `${actorId}@example.test`;
const number = `PO-${randomUUID()}`;
const origin = 'http://localhost:3000';
const source = JSON.stringify({
  schemaVersion: '1', kind: 'PO', documentNumber: number, poReference: number,
  supplierId: 'acteck', supplierName: 'Acteck', issuedAt: '2026-10-09',
  total: { currency: 'MXN', minorUnits: '2500' },
  items: [{ sku: 'DEMO', description: 'Equipo de prueba', quantity: 1, unitPriceMinorUnits: '2500' }],
});

describe.runIf(Boolean(process.env.DATABASE_URL))('contrato HTTP de documentos', () => {
  let cookie = '';
  let csrf = '';
  let documentId = '';
  beforeAll(async () => {
    process.env.SESSION_SECRET = 'fixture-secret-with-at-least-thirty-two-chars';
    process.env.APP_BASE_URL = origin;
    await database().query('INSERT INTO demo_users(id,email,password_hash) VALUES($1,$2,$3)', [actorId, email, await hashPassword('long demo password')]);
    const request = new NextRequest(`${origin}/api/v1/session`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'long demo password' }),
    });
    const reply = await login(request);
    expect(reply.status).toBe(200);
    cookie = reply.headers.get('set-cookie')?.split(';')[0] ?? '';
    csrf = (await reply.json()).data.csrfToken;
  });
  afterAll(async () => {
    if (documentId) {
      await database().query('DELETE FROM document_events WHERE document_id=$1', [documentId]);
      await database().query('DELETE FROM document_versions WHERE document_id=$1', [documentId]);
      await database().query('DELETE FROM documents WHERE id=$1', [documentId]);
    }
    await database().query('DELETE FROM http_idempotency WHERE actor_id=$1', [actorId]);
    await database().query('DELETE FROM sessions WHERE user_id=$1', [actorId]);
    await database().query('DELETE FROM demo_users WHERE id=$1', [actorId]);
  });

  it('exige CSRF y permite cargar, consultar y descargar el mismo original', async () => {
    const form = () => {
      const body = new FormData();
      body.set('file', new File([source], 'po.json', { type: 'application/json' }));
      body.set('kind', 'PO');
      return body;
    };
    const headers = { origin, cookie, 'idempotency-key': randomUUID() };
    const blocked = await upload(new NextRequest(`${origin}/api/v1/documents`, { method: 'POST', headers, body: form() }));
    expect(blocked.status).toBe(403);

    const accepted = await upload(new NextRequest(`${origin}/api/v1/documents`, {
      method: 'POST', headers: { ...headers, 'x-csrf-token': csrf }, body: form(),
    }));
    expect(accepted.status).toBe(201);
    documentId = (await accepted.json()).data.documentId;
    expect(documentId).toBeTruthy();

    const read = await getDocument(new NextRequest(`${origin}/api/v1/documents/${documentId}`, { headers: { cookie } }), { params: Promise.resolve({ id: documentId }) });
    expect((await read.json()).data.data.total.minorUnits).toBe('2500');
    const original = await getOriginal(new NextRequest(`${origin}/api/v1/documents/${documentId}/versions/1/original`, { headers: { cookie } }), { params: Promise.resolve({ id: documentId, version: '1' }) });
    expect(await original.text()).toBe(source);
  });
});
