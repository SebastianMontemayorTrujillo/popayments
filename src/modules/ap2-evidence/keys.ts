import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from '@/shared/errors';

export const roles = ['demo-trusted-provider','demo-agent','demo-merchant-proxy','demo-verifier'] as const;
export type KeyRole = typeof roles[number];
export type Keyring = Record<KeyRole, { privateKey: KeyObject; publicKey: KeyObject; jwk: JsonWebKey }>;

function directory(): string { return process.env.AP2_KEY_DIR || '.local/ap2-keys'; }

export async function initializeDemoKeys(): Promise<void> {
  const path = directory();
  await mkdir(path, { recursive: true, mode: 0o700 });
  for (const role of roles) {
    const privatePath = join(path, `${role}.pem`);
    const publicPath = join(path, `${role}.jwk.json`);
    const existing = await Promise.all([readFile(privatePath).catch(() => null), readFile(publicPath).catch(() => null)]);
    if (existing[0] && existing[1]) continue;
    if (existing[0] || existing[1]) throw new AppError(500, 'AP2_KEYS_INCOMPLETE', `Falta una clave de ${role}`);
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    await writeFile(privatePath, pair.privateKey.export({ format: 'pem', type: 'pkcs8' }), { flag: 'wx', mode: 0o600 });
    await writeFile(publicPath, JSON.stringify(pair.publicKey.export({ format: 'jwk' })), { flag: 'wx', mode: 0o644 });
  }
}

export async function loadKeyring(): Promise<Keyring> {
  const entries = await Promise.all(roles.map(async (role) => {
    const privateKey = createPrivateKey(await readFile(join(directory(), `${role}.pem`)));
    const jwk = JSON.parse(await readFile(join(directory(), `${role}.jwk.json`), 'utf8')) as JsonWebKey;
    const publicKey = createPublicKey(privateKey);
    const actual = publicKey.export({ format: 'jwk' });
    if (actual.kty !== 'EC' || actual.crv !== 'P-256' || actual.x !== jwk.x || actual.y !== jwk.y) {
      throw new AppError(500, 'AP2_KEYS_MISMATCH', `Las claves de ${role} no corresponden`);
    }
    return [role, { privateKey, publicKey, jwk }] as const;
  }));
  return Object.fromEntries(entries) as Keyring;
}
