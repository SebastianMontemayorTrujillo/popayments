# Spec: documents — PO y factura JSON/XML

Estado: aprobado por el usuario el 2026-10-09. Módulo del [mapa aprobado](CAPABILITY-MAP.md). Depende de: ninguno. Consumidores: conciliación, autorización, evidencia y workflow.

## Objetivo

Recibir documentos estructurados y producir datos deterministas comparables sin perder el archivo original. Una persona de Cuentas por Pagar debe poder cargar PO y factura, reconocer errores de formato y consultar qué versión se utilizó para autorizar un pago.

## Contrato de documento v1

JSON UTF-8 con objeto raíz; XML UTF-8 propio con raíz `Document`, namespace `urn:popayments:document:v1` y atributos `schemaVersion="1"` y `kind="PO"` o `kind="INVOICE"`. Los campos comunes son obligatorios. No se admite CFDI ni XML arbitrario.

| Campo normalizado | Tipo | Regla |
|---|---|---|
| `schemaVersion` | `"1"` | Rechazar versiones desconocidas. |
| `kind` | `"PO"` o `"INVOICE"` | Debe coincidir con el destino de carga. |
| `documentNumber` | string | 1–100 caracteres; identifica el documento dentro de proveedor y tipo. |
| `poReference` | string | 1–100 caracteres; en PO coincide con su número; en factura declara la PO relacionada. |
| `supplierId` | string | Identidad declarada del proveedor; por defecto `acteck` en fixtures. |
| `supplierName` | string | Nombre de presentación; no participa en la coincidencia. |
| `issuedAt` | string | Fecha válida `YYYY-MM-DD`. |
| `total` | objeto Money | Moneda MXN o USD y `minorUnits` positivo. Incluye todos los cargos previstos en el documento. |
| `items` | array | Obligatorio en PO, 1–50 partidas. En factura opcional, 0–50. Cada partida: `sku`, `description`, `quantity` entero positivo y `unitPriceMinorUnits` entero decimal en texto. |

Strings se recortan y normalizan a Unicode NFC. Referencias y `supplierId` preservan mayúsculas y caracteres internos: no se hace matching difuso. `minorUnits` normaliza ceros iniciales y se compara como entero. La moneda se exige en mayúsculas. Límites: dos MiB por archivo, profundidad máxima 20; se rechazan propiedades, elementos y atributos desconocidos. Se conserva el archivo previo a normalizar.

```json
{
  "schemaVersion": "1",
  "kind": "PO",
  "documentNumber": "PO-001",
  "poReference": "PO-001",
  "supplierId": "acteck",
  "supplierName": "Acteck",
  "issuedAt": "2026-10-09",
  "total": { "currency": "MXN", "minorUnits": "116000" },
  "items": [
    { "sku": "DEMO-001", "description": "Equipo de ejemplo", "quantity": 1, "unitPriceMinorUnits": "100000" }
  ]
}
```

XML equivalente:

```xml
<Document xmlns="urn:popayments:document:v1" schemaVersion="1" kind="PO">
  <DocumentNumber>PO-001</DocumentNumber>
  <PoReference>PO-001</PoReference>
  <SupplierId>acteck</SupplierId>
  <SupplierName>Acteck</SupplierName>
  <IssuedAt>2026-10-09</IssuedAt>
  <Total currency="MXN" minorUnits="116000"/>
  <Items>
    <Item sku="DEMO-001" quantity="1" unitPriceMinorUnits="100000">
      <Description>Equipo de ejemplo</Description>
    </Item>
  </Items>
</Document>
```

El JSON de una factura cambia `kind`, `documentNumber` y, opcionalmente, partidas; mantiene `poReference` de la PO para el caso de coincidencia. Cada elemento XML escalar aparece una vez. El parser conserva importes y referencias como texto y prohíbe DTD, entidades externas, XInclude y resolución de red/archivos. JSON con claves duplicadas y XML con campos escalares repetidos se rechazan antes de la validación común.

## API y persistencia

| API | Entrada | Salida |
|---|---|---|
| `POST /api/v1/documents` | Multipart: `file`, `kind`; Idempotency-Key. | 201 con DocumentVersion, o 200 si el original ya se había cargado. |
| `POST /api/v1/documents/:id/versions` | Nuevo archivo del mismo tipo y `documentNumber`; Idempotency-Key. | 201 con nueva versión append-only. |
| `GET /api/v1/documents/:id` | ID. | Documento y versión vigente, incluyendo datos normalizados. |
| `GET /api/v1/documents/:id/versions/:version` | Referencia exacta. | DocumentVersion inmutable. |
| `GET /api/v1/documents/:id/versions/:version/original` | Referencia exacta. | Descarga autenticada con tipo y nombre saneados. |

`DocumentRef = { documentId, version, sourceHash, canonicalHash }`. `DocumentVersion` añade `data`, `format`, `createdAt` y `uploadedBy`. `sourceHash` cubre bytes originales; `canonicalHash` cubre datos normalizados. Los consumidores siempre usan una versión explícita, nunca un puntero mutable a la última versión.

Tablas propias: `documents`, `document_versions`; originales en BYTEA dado el tamaño limitado. La identidad lógica usa empresa, tipo, proveedor y número al crear el documento. Índices únicos para identidad y número de versión. Un upload idéntico devuelve el registro ya existente; un documento distinto con esa identidad exige una nueva versión explícita. Cambiar proveedor en una revisión no cambia el ID lógico ni elimina su historial y se trata como dato discrepante.

Una versión posterior invalida las decisiones pendientes que dependan de la anterior y genera un evento durable para el workflow. Una carga no puede por sí sola reasignar una factura a otra PO. Una operación ya enviada a Reap continúa vinculada a los originales autorizados; no se intenta modificarla retroactivamente.

## Stack, comandos, estructura y estilo

Aplican [convenciones comunes](SPEC-CONVENTIONS.md): Node/TypeScript, Zod, fast-xml-parser, PostgreSQL/pg. Dominio y normalización en `src/modules/documents/`; tests en `tests/unit/documents/` y `tests/integration/documents/`.

```bash
npm run test -- --run tests/unit/documents tests/integration/documents
npm run typecheck
npm run lint
npm run build
```

Ejemplo de contrato y estilo, a implementar:

```typescript
type DocumentKind = 'PO' | 'INVOICE';
type Money = Readonly<{ currency: 'MXN' | 'USD'; minorUnits: string }>;

interface DocumentRef {
  readonly documentId: string;
  readonly version: number;
  readonly sourceHash: string;
  readonly canonicalHash: string;
}
```

Funciones pequeñas de lectura y normalización separadas de la persistencia. Parsear ambos formatos hacia el mismo esquema; errores con ruta de campo, nunca volcado del archivo.

## Pruebas y criterios de éxito

- JSON y XML de la misma PO producen datos y hash canónico iguales, aunque sus hashes de origen sean distintos.
- Importe cero/negativo, moneda desconocida, fecha inválida, campo ausente, archivo demasiado grande o formato mal declarado devuelven el error preciso sin crear un documento válido.
- Claves duplicadas, DTD/XXE, profundidad excesiva y campos repetidos se rechazan sin realizar accesos externos.
- Cargar dos veces el mismo archivo y hacerlo concurrentemente no crea versiones duplicadas.
- La versión anterior y su original permanecen consultables; una nueva versión notifica al workflow y requiere decisiones nuevas para cualquier efecto futuro.
- El usuario puede descargar el original y ver el proveedor, referencia, moneda, total y versión usados.

## Límites y cuestiones pendientes

Siempre: validar y guardar el original con su hash antes de emitir el evento. Consultar antes de admitir CFDI, PDF, un nuevo dialecto o pagos parciales. Nunca: corregir datos de documentos silenciosamente, resolver entidades XML o atribuir firma fiscal a un archivo subido.

El esquema es un default propuesto para la demo. Los ejemplos reales del equipo deberán adaptarse a él o aprobar una modificación compatible de esta spec antes de implementar otro formato.
