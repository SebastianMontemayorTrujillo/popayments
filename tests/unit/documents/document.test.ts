import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../../src/modules/documents/parse';

const json = JSON.stringify({
  schemaVersion: '1', kind: 'PO', documentNumber: 'PO-001', poReference: 'PO-001',
  supplierId: 'acteck', supplierName: 'Acteck', issuedAt: '2026-10-09',
  total: { currency: 'MXN', minorUnits: '116000' },
  items: [{ sku: 'DEMO-001', description: 'Equipo de ejemplo', quantity: 1, unitPriceMinorUnits: '100000' }],
});
const xml = `<Document xmlns="urn:popayments:document:v1" schemaVersion="1" kind="PO">
<DocumentNumber>PO-001</DocumentNumber><PoReference>PO-001</PoReference>
<SupplierId>acteck</SupplierId><SupplierName>Acteck</SupplierName><IssuedAt>2026-10-09</IssuedAt>
<Total currency="MXN" minorUnits="116000"/><Items><Item sku="DEMO-001" quantity="1" unitPriceMinorUnits="100000"><Description>Equipo de ejemplo</Description></Item></Items></Document>`;

describe('documentos de la demo', () => {
  it('normaliza PO JSON y XML al mismo contenido canónico', () => {
    const a = parseDocument(Buffer.from(json), 'json', 'PO');
    const b = parseDocument(Buffer.from(xml), 'xml', 'PO');
    expect(a.data).toEqual(b.data);
    expect(a.canonicalHash).toBe(b.canonicalHash);
    expect(a.sourceHash).not.toBe(b.sourceHash);
  });

  it('rechaza claves JSON duplicadas en niveles anidados', () => {
    const duplicate = json.replace('"currency":"MXN"', '"currency":"MXN","currency":"USD"');
    expect(() => parseDocument(Buffer.from(duplicate), 'json', 'PO')).toThrow(/duplicad/i);
  });

  it('rechaza entidades XML y no lee archivos externos', () => {
    const hostile = `<!DOCTYPE Document [<!ENTITY leak SYSTEM "file:///etc/passwd">]>${xml.replace('Acteck', '&leak;')}`;
    expect(() => parseDocument(Buffer.from(hostile), 'xml', 'PO')).toThrow();
  });

  it('rechaza cambios de tipo, fecha inválida e importe cero', () => {
    expect(() => parseDocument(Buffer.from(json), 'json', 'INVOICE')).toThrow();
    expect(() => parseDocument(Buffer.from(json.replace('2026-10-09', '2026-02-30')), 'json', 'PO')).toThrow();
    expect(() => parseDocument(Buffer.from(json.replace('"116000"', '"0"')), 'json', 'PO')).toThrow();
  });
});
