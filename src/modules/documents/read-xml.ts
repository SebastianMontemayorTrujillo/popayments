import { XMLParser, XMLValidator } from 'fast-xml-parser';

type XmlValue = Record<string, unknown>;
function object(value: unknown): XmlValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Estructura XML inválida');
  return value as XmlValue;
}
function keys(value: XmlValue, allowed: readonly string[]) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Campo XML desconocido: ${key}`);
}
function scalar(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Campo XML escalar ausente o repetido');
  return value;
}

export function readXml(source: string): unknown {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b|<\s*xi:include\b/i.test(source)) throw new Error('DTD, entidades y XInclude no permitidos');
  const valid = XMLValidator.validate(source);
  if (valid !== true) throw new Error('XML inválido');
  const parser = new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false,
    parseTagValue: false, trimValues: true, processEntities: false,
    allowBooleanAttributes: false,
  });
  const root = object(object(parser.parse(source)).Document);
  keys(root, ['@_xmlns', '@_schemaVersion', '@_kind', 'DocumentNumber', 'PoReference', 'SupplierId', 'SupplierName', 'IssuedAt', 'Total', 'Items']);
  if (root['@_xmlns'] !== 'urn:popayments:document:v1') throw new Error('Namespace XML desconocido');
  const total = object(root.Total);
  keys(total, ['@_currency', '@_minorUnits']);
  let items: unknown[] = [];
  if (root.Items !== undefined && root.Items !== '') {
    const container = object(root.Items);
    keys(container, ['Item']);
    items = container.Item === undefined ? [] : Array.isArray(container.Item) ? container.Item : [container.Item];
  }
  return {
    schemaVersion: scalar(root['@_schemaVersion']),
    kind: scalar(root['@_kind']),
    documentNumber: scalar(root.DocumentNumber),
    poReference: scalar(root.PoReference),
    supplierId: scalar(root.SupplierId),
    supplierName: scalar(root.SupplierName),
    issuedAt: scalar(root.IssuedAt),
    total: { currency: scalar(total['@_currency']), minorUnits: scalar(total['@_minorUnits']) },
    items: items.map((itemValue) => {
      const item = object(itemValue);
      keys(item, ['@_sku', '@_quantity', '@_unitPriceMinorUnits', 'Description']);
      const quantity = scalar(item['@_quantity']);
      if (!/^\d+$/.test(quantity)) throw new Error('Cantidad XML inválida');
      return { sku: scalar(item['@_sku']), description: scalar(item.Description), quantity: Number(quantity), unitPriceMinorUnits: scalar(item['@_unitPriceMinorUnits']) };
    }),
  };
}
