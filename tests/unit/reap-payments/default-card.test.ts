import { describe, expect, it } from 'vitest';
import { selectDefaultCard } from '@/modules/reap-payments/default-card';

const preference = { last4: '1234', expiryMonth: 12, expiryYear: 2030 };
const enrollment = { id: 'local-enrollment', providerId: 'reap-enrollment', status: 'ACTIVE',
  nextActionUrl: null, createdAt: '2026-10-01T00:00:00Z',
  paymentMethod: { type: 'CARD' as const, network: 'VISA', ...preference } };

describe('tarjeta predeterminada', () => {
  it('mantiene pendiente una preferencia hasta tener el enrollment ACTIVE de esa tarjeta', () => {
    for (const rows of [[], [{ ...enrollment, status: 'REQUIRES_ACTION' }],
      [{ ...enrollment, paymentMethod: { ...enrollment.paymentMethod, last4: '9999' } }]]) {
      expect(selectDefaultCard(rows, preference)).toMatchObject({ ...preference, status: 'PENDING_ENROLLMENT', enrollmentId: null });
    }
  });

  it('selecciona la referencia local de la tarjeta coincidente y activa', () => {
    expect(selectDefaultCard([enrollment], preference)).toMatchObject({ status: 'ACTIVE', enrollmentId: enrollment.id, ...preference });
  });

  it('no selecciona una referencia de proveedor o metadatos ausentes', () => {
    expect(selectDefaultCard([{ ...enrollment, providerId: null }], null)).toBeNull();
    expect(selectDefaultCard([{ ...enrollment, paymentMethod: null }], null)).toBeNull();
  });
});
