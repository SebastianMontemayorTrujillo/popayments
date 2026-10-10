import type { DocumentData } from '@/modules/documents/contracts';
import { parseMinor } from '@/shared/money';

export type ComparedField = 'PO_REFERENCE' | 'SUPPLIER' | 'CURRENCY' | 'TOTAL';
export interface Difference { field: ComparedField; poValue: string; invoiceValue: string }
export type Comparison = Readonly<{ status: 'MATCHED' | 'MISMATCHED'; differences: Difference[] }>;

export function compareHeaders(po: DocumentData, invoice: DocumentData): Comparison {
  if (po.kind !== 'PO' || invoice.kind !== 'INVOICE') throw new Error('Se requiere una PO y una factura');
  const differences: Difference[] = [];
  const compare = (field: ComparedField, poValue: string, invoiceValue: string) => {
    if (poValue !== invoiceValue) differences.push({ field, poValue, invoiceValue });
  };
  compare('PO_REFERENCE', po.poReference, invoice.poReference);
  compare('SUPPLIER', po.supplierId, invoice.supplierId);
  compare('CURRENCY', po.total.currency, invoice.total.currency);
  compare('TOTAL', parseMinor(po.total.minorUnits).toString(), parseMinor(invoice.total.minorUnits).toString());
  return { status: differences.length ? 'MISMATCHED' : 'MATCHED', differences };
}
