import { describe, expect, it } from 'vitest';
import { canonicalHash, canonicalJson } from '../../../src/shared/canonical-json';
import { formatMajor, parseMinor, sameMoney } from '../../../src/shared/money';

describe('dinero y hashes canónicos', () => {
  it('compara centavos sin redondeos de coma flotante', () => {
    expect(sameMoney({ currency: 'MXN', minorUnits: '000123' }, { currency: 'MXN', minorUnits: '123' })).toBe(true);
    expect(sameMoney({ currency: 'MXN', minorUnits: '123' }, { currency: 'USD', minorUnits: '123' })).toBe(false);
    expect(formatMajor({ currency: 'MXN', minorUnits: '123' })).toBe('1.23');
    expect(formatMajor({ currency: 'MXN', minorUnits: '1' })).toBe('0.01');
  });

  it('rechaza cantidades inválidas y preserva enteros grandes', () => {
    expect(() => parseMinor('-1')).toThrow();
    expect(() => parseMinor('1.2')).toThrow();
    expect(formatMajor({ currency: 'MXN', minorUnits: '9007199254740993' })).toBe('90071992547409.93');
  });

  it('ordena claves recursivamente y mantiene orden de arrays', () => {
    const a = { z: [{ b: 2, a: 1 }], a: 'á' };
    const b = { a: 'á', z: [{ a: 1, b: 2 }] };
    expect(canonicalJson(a)).toBe('{"a":"á","z":[{"a":1,"b":2}]}');
    expect(canonicalHash(a)).toBe(canonicalHash(b));
  });
});
