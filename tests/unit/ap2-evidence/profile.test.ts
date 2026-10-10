import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeDemoKeys, loadKeyring, type Keyring } from '@/modules/ap2-evidence/keys';
import { issueDelegatedMandate, issueOpenMandate, verifyDelegatedMandate, verifyOpenMandate } from '@/modules/ap2-evidence/profile';

let directory = '';
let keys: Keyring;
const prior = process.env.AP2_KEY_DIR;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'popayments-ap2-'));
  process.env.AP2_KEY_DIR = directory;
  await initializeDemoKeys();
  keys = await loadKeyring();
});
afterAll(async () => { await rm(directory, { recursive: true, force: true });
  if (prior === undefined) delete process.env.AP2_KEY_DIR; else process.env.AP2_KEY_DIR = prior; });

describe('perfil SD-JWT delegado', () => {
  it('encadena disclosure abierto, sd_hash y disclosure cerrado verificables', async () => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const open = await issueOpenMandate({ vct: 'mandate.checkout.open.1', iat: issuedAt, exp: issuedAt + 300,
      cnf: { jwk: keys['demo-agent'].jwk }, constraints: [{ type: 'checkout.allowed_merchants', allowed: [{ name: 'Acteck', website: 'https://acteck.example' }] }] }, keys);
    expect((await verifyOpenMandate(open, 'mandate.checkout.open.1', keys)).constraints).toHaveLength(1);
    const closed = await issueDelegatedMandate(open, { vct: 'mandate.checkout.1', iat: issuedAt, exp: issuedAt + 240,
      checkout_hash: 'hash-fixture', checkout_jwt: 'merchant-fixture' }, 'popayments-verifier', 'unique-nonce', keys);
    const parts = closed.split('~');
    expect(parts).toHaveLength(6);
    expect(parts[2]).toBe('');
    const kbPayload = JSON.parse(Buffer.from(parts[3].split('.')[1], 'base64url').toString());
    expect(kbPayload.sd_hash).toBe(createHash('sha256').update(open).digest('base64url'));
    expect(kbPayload.delegate_payload[0]['...']).toBe(createHash('sha256').update(parts[4]).digest('base64url'));
    expect((await verifyDelegatedMandate(closed, 'mandate.checkout.1', 'popayments-verifier', 'unique-nonce', keys)).closed.checkout_hash).toBe('hash-fixture');
    await expect(verifyDelegatedMandate(closed, 'mandate.checkout.1', 'popayments-verifier', 'wrong-nonce', keys)).rejects.toThrow();
    const changed = [...parts]; changed[4] = Buffer.from(JSON.stringify(['fixture-salt-123456', { vct: 'mandate.checkout.1' }])).toString('base64url');
    await expect(verifyDelegatedMandate(changed.join('~'), 'mandate.checkout.1', 'popayments-verifier', 'unique-nonce', keys)).rejects.toThrow();
  });
});
