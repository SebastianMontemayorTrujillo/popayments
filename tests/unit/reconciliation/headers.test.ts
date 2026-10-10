import { describe, expect, it } from 'vitest';
import { compareHeaders } from '../../../src/modules/reconciliation/compare';
import type { DocumentData } from '../../../src/modules/documents/contracts';

const po: DocumentData = {
  schemaVersion: '1', kind: 'PO', documentNumber: 'PO-001', poReference: 'PO-001',
  supplierId: 'acteck', supplierName: 'Acteck', issuedAt: '2026-10-09',
  total: { currency: 'MXN', minorUnits: '116000' },
  items: [{ sku: 'A', description: 'Equipo', quantity: 1, unitPriceMinorUnits: '100000' }],
};
const invoice: DocumentData = { ...po, kind: 'INVOICE', documentNumber: 'F-001', items: [] };

describe('conciliación de cuatro campos', () => {
  it('ignora partidas, número de factura y fecha', () => {
    const result = compareHeaders(po, { ...invoice, issuedAt: '2026-10-10', supplierName: 'Nombre de presentación distinto' });
    expect(result).toEqual({ status: 'MATCHED', differences: [] });
  });

  it('reporta todas las diferencias sin conversión monetaria', () => {
    const result = compareHeaders(po, { ...invoice, poReference: 'PO-X', supplierId: 'otro', total: { currency: 'USD', minorUnits: '116001' } });
    expect(result.status).toBe('MISMATCHED');
    expect(result.differences.map((item) => item.field)).toEqual(['PO_REFERENCE', 'SUPPLIER', 'CURRENCY', 'TOTAL']);
  });

  it('normaliza representación decimal y detecta un centavo', () => {
    expect(compareHeaders(po, { ...invoice, total: { currency: 'MXN', minorUnits: '0116000' } }).status).toBe('MATCHED');
    expect(compareHeaders(po, { ...invoice, total: { currency: 'MXN', minorUnits: '116001' } }).differences).toHaveLength(1);
  });
});
