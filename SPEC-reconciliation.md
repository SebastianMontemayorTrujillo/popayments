# Spec: reconciliation — comparación de PO y factura

Estado: aprobado por el usuario el 2026-10-09. Módulo del [mapa aprobado](CAPABILITY-MAP.md). Depende de [documents](SPEC-documents.md). Consumidores: autorización y workflow.

## Objetivo

Determinar de manera reproducible si una PO y una factura coinciden en los cuatro campos confirmados: referencia de PO, proveedor, moneda y total. Entregar diferencias verificables a la persona que revisa una excepción. Las partidas no influyen en este resultado.

## Reglas

El consumidor selecciona una PO y una factura por DocumentRef. El sistema verifica tipo, empresa y vigencia, lee ambas versiones persistidas y compara los valores normalizados:

| Campo de resultado | Valor PO | Valor factura |
|---|---|---|
| `PO_REFERENCE` | `poReference` | `poReference` |
| `SUPPLIER` | `supplierId` | `supplierId` |
| `CURRENCY` | `total.currency` | `total.currency` |
| `TOTAL` | Entero de `total.minorUnits` | Entero de `total.minorUnits` |

Se exige igualdad exacta. No hay tolerancia monetaria, conversión FX ni un LLM evaluando si dos proveedores son equivalentes. Si cambia moneda, se reporta ese campo y cualquier diferencia numérica de total; no se interpreta como una comparación económica entre monedas.

Solo cuatro verificaciones verdaderas producen `MATCHED`. Una o más diferencias producen `MISMATCHED`. Un documento inválido, tipo incorrecto o versión ausente produce error de entrada; no una discrepancia aprobable.

El vínculo entre documentos lo proporciona el caso del workflow. Permite revisar una factura con referencia errónea sin asociarla automáticamente a una PO incorrecta. No se adivina la relación por proveedor o total.

## Contratos y API

```typescript
type ComparedField = 'PO_REFERENCE' | 'SUPPLIER' | 'CURRENCY' | 'TOTAL';

interface Difference {
  readonly field: ComparedField;
  readonly poValue: string;
  readonly invoiceValue: string;
}

interface ReconciliationResult {
  readonly id: string;
  readonly po: DocumentRef;
  readonly invoice: DocumentRef;
  readonly rulesVersion: 'header-v1';
  readonly status: 'MATCHED' | 'MISMATCHED';
  readonly differences: readonly Difference[];
  readonly createdAt: string;
}
```

`reconcile({ po, invoice })` es la interfaz de servicio del módulo. Carga las referencias desde documents; su núcleo `compareHeaders(poData, invoiceData)` es puro. Devuelve resultado y hashes/versiones vinculados; la hora procede del reloj de servidor.

| API | Entrada | Salida |
|---|---|---|
| `POST /api/v1/reconciliations` | `{ caseId, po: DocumentRef, invoice: DocumentRef }`, Idempotency-Key. | 201 resultado nuevo o 200 resultado existente. |
| `GET /api/v1/reconciliations/:id` | ID. | Resultado con las cuatro verificaciones y diferencias. |

El Route Handler de workflow valida que las referencias pertenecen al caso y delega al módulo. `caseId` es metadato de correlación; el dominio de reconciliation no importa el repositorio del workflow.

Tabla propia `reconciliations`, con resultado inmutable e índice único por empresa, ambas referencias/versiones y `rulesVersion`. Repetir la comparación de la misma pareja no genera otra decisión ni otro pago. La regla de pago pertenece a authorization y reap-payments.

## Flujo y presentación

Tras la carga de factura o autorización de una PO con factura disponible, el workflow solicita la conciliación. `MATCHED` indica coincidencia documental y permite evaluar la autorización. No equivale a `COMPLETED` ni garantiza que Reap acepte el cargo.

En `MISMATCHED`, la consola muestra ambas columnas y señala cada diferencia. Texto propuesto: «Advertencia. La PO y la factura no coinciden». La revisión manual conserva ese resultado y produce una decisión de excepción independiente; no convierte el resultado a `MATCHED`.

Una nueva versión genera una nueva conciliación. Los resultados anteriores permanecen vinculados a sus decisiones y evidencia.

## Stack, comandos, estructura y estilo

[Convenciones comunes](SPEC-CONVENTIONS.md). TypeScript para el comparador y PostgreSQL/pg para resultados. Código en `src/modules/reconciliation/`; tests de tablas de casos en `tests/unit/reconciliation/` e integración de referencias/persistencia en `tests/integration/reconciliation/`.

```bash
npm run test -- --run tests/unit/reconciliation tests/integration/reconciliation
npm run typecheck
npm run lint
npm run build
```

Ejemplo del estilo esperado:

```typescript
function sameTotal(po: Money, invoice: Money): boolean {
  return BigInt(po.minorUnits) === BigInt(invoice.minorUnits);
}
```

La igualdad de moneda se comprueba por separado. Evitar heurísticas, efectos laterales y comparaciones de floats.

## Pruebas y criterios de éxito

- Igualdad de los cuatro campos produce MATCHED con cero diferencias.
- Cada campo distinto por separado y varias diferencias simultáneas producen MISMATCHED con causas completas.
- Partidas, fecha y nombre de presentación diferentes, manteniendo los cuatro campos iguales, no bloquean MATCHED.
- Totales representados con ceros iniciales normalizados comparan igual; una diferencia de un centavo se detecta.
- JSON/XML equivalentes producen el mismo resultado y repetir el job no duplica conciliaciones.
- Una factura ligada manualmente a una PO con referencia errónea muestra PO_REFERENCE; no cambia el vínculo elegido.
- Acceso entre empresas, documento faltante y tipos incorrectos devuelven error y no producen un resultado aprobable.

## Límites y cuestiones pendientes

Siempre: documentar la versión de reglas y conservar los valores comparados. Consultar cambios a campos, tolerancia, alias de proveedor o vinculación automática. Nunca: reemplazar una discrepancia por MATCHED debido a un clic de revisión, al texto del agente o a una excepción.

No hay decisiones de negocio pendientes para `header-v1`; cualquier cambio al criterio confirmado requiere revisar esta spec y las autorizaciones afectadas.
