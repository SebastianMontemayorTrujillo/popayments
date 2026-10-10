import type { Money } from '@/shared/money';

export type DocumentKind = 'PO' | 'INVOICE';
export type DocumentFormat = 'json' | 'xml';
export interface DocumentItem {
  sku: string;
  description: string;
  quantity: number;
  unitPriceMinorUnits: string;
}
export interface DocumentData {
  schemaVersion: '1';
  kind: DocumentKind;
  documentNumber: string;
  poReference: string;
  supplierId: string;
  supplierName: string;
  issuedAt: string;
  total: Money;
  items: DocumentItem[];
}
export interface DocumentRef {
  documentId: string;
  version: number;
  sourceHash: string;
  canonicalHash: string;
}
export interface ParsedDocument {
  data: DocumentData;
  format: DocumentFormat;
  sourceHash: string;
  canonicalHash: string;
}
