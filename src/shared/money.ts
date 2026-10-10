export type Currency = 'MXN' | 'USD';
export type Money = Readonly<{ currency: Currency; minorUnits: string }>;

export function parseMinor(value: string): bigint {
  if (!/^[0-9]+$/.test(value)) throw new Error('El importe debe ser un entero decimal no negativo');
  return BigInt(value);
}

export function normalizeMinor(value: string): string {
  return parseMinor(value).toString();
}

export function sameMoney(a: Money, b: Money): boolean {
  return a.currency === b.currency && parseMinor(a.minorUnits) === parseMinor(b.minorUnits);
}

export function formatMajor(money: Money): string {
  const minor = parseMinor(money.minorUnits);
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`;
}

export function parseMajor(value: string, currency: Currency): Money {
  if (!/^\d+\.\d{2}$/.test(value)) throw new Error('El importe mayor requiere exactamente dos decimales');
  const [major, cents] = value.split('.');
  return { currency, minorUnits: (BigInt(major) * 100n + BigInt(cents)).toString() };
}
