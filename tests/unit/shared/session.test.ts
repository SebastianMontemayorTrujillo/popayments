import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../../src/shared/session';

describe('contraseñas del aprobador', () => {
  it('solo acepta la contraseña correcta y no la conserva en el hash', async () => {
    const stored = await hashPassword('clave de demo suficientemente larga');
    expect(stored).not.toContain('clave de demo');
    expect(await verifyPassword('clave de demo suficientemente larga', stored)).toBe(true);
    expect(await verifyPassword('otra clave', stored)).toBe(false);
  });

  it('rechaza un hash manipulado', async () => {
    expect(await verifyPassword('clave', 'scrypt:rotura')).toBe(false);
  });
});
