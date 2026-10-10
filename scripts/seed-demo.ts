import { randomUUID } from 'node:crypto';
import { database } from '../src/shared/database';

const email = process.env.DEMO_EMAIL?.trim().toLowerCase();
const hash = process.env.DEMO_PASSWORD_HASH;
if (!email || !hash?.startsWith('scrypt:')) throw new Error('Configura DEMO_EMAIL y DEMO_PASSWORD_HASH');
await database().query(`INSERT INTO demo_users(id,email,password_hash) VALUES($1,$2,$3)
  ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash`, [randomUUID(), email, hash]);
await database().end();
process.stdout.write('Aprobador de demo preparado\n');
