# Spec: authorization — permisos de compra y excepciones

Estado: aprobado por el usuario el 2026-10-09. Módulo del [mapa aprobado](CAPABILITY-MAP.md). Depende de [documents](SPEC-documents.md) y [reconciliation](SPEC-reconciliation.md). Consumidores: evidencia, pagos y workflow.

## Objetivo

Permitir que Cuentas por Pagar autorice previamente cada PO y que una coincidencia avance automáticamente dentro de ese permiso. Una discrepancia necesita una decisión humana justificada sobre las condiciones concretas del pago. Ninguna respuesta del agente puede sustituir esa decisión.

## Aprobación previa y términos

Antes de aprobar la PO, la consola presenta su versión, proveedor, partidas, importe máximo, moneda, merchant Acteck, instrumento enrolado y plan de compra seleccionado. El plan vincula cada partida a productos/variantes de Reap y cantidades; esa selección ocurre antes del consentimiento. Cambiar productos o cantidades requiere una nueva autorización aunque no cambie el total.

La aprobación dura 24 horas por defecto, admite un cargo y liga el ID lógico y versión de PO, hashes, merchant, moneda, máximo igual al total de PO, plan e instrumento. Este plazo es un supuesto técnico propuesto. No se amplía al reintentar ni al reiniciar. Una nueva versión, revocación o expiración impide iniciar efectos nuevos.

La cotización es un snapshot que entrega el coordinador; este módulo no llama a Reap. `QuoteSnapshot` contiene `quoteId`, `merchantId`, `merchantWebsite`, `purchasePlanHash`, `amount: Money`, `expiresAt`, `termsHash` y condiciones de envío. El hash cubre importe, moneda, productos, cantidades, dirección y opción de envío. El total incluye impuestos y envío. No se entrega una dirección personal al LLM.

Una coincidencia genera un permiso automático únicamente si existe aprobación previa vigente, los documentos son versiones actuales, el merchant es Acteck, plan e instrumento siguen aprobados, el total de cotización coincide exactamente con factura/PO y aún no hay pago enviado o completado. Si no coincide la cotización, se muestra revisión de términos; no se paga una cantidad aproximada.

## Revisión, excepción y rechazo

«Facturas revisadas» registra que una persona examinó el resultado y sus cuatro campos. Ese registro no autoriza el pago. «Autorizar Pago» en una discrepancia exige revisión, justificación de 10–1000 caracteres y consentimiento explícito a moneda, importe final, Acteck, productos, envío e instrumento. Se guardan los documentos originales, diferencias y términos aceptados.

Una excepción puede superar el máximo previo o aceptar otra moneda admitida: crea una autorización sustitutiva y nueva delegación para esos términos. No modifica la PO ni convierte MISMATCHED en MATCHED. Una discrepancia de proveedor se puede justificar, pero el destinatario efectivo sigue siendo Acteck y se señala claramente. No permite pagar a un merchant diferente. La cotización debe igualar el total y moneda de la factura aceptados; cualquier otra propuesta exige corregir la factura o revisar el alcance de esta spec.

Si cambia solamente el precio de la cotización con documentos coincidentes, la revisión exige una decisión `AUTHORIZE_QUOTE_CHANGE` con justificación y importe explícito; el registro diferencia ese importe del documental. Un cambio de plan/instrumento exige nueva aprobación de compra. Renovar una cotización idéntica puede reutilizar la aprobación vigente, pero genera evidencia nueva ligada al nuevo `quoteId`.

«Rechazar Pago» termina el caso antes del envío. Rechazo y reserva compiten en una transacción: solo uno gana. Después de reservar para envío, no se promete detener el cargo; el rechazo devuelve 409 y se presenta su estado real. No hay cancelación/refund de un checkout en esta entrega.

## Contratos y persistencia

```typescript
type DecisionKind = 'APPROVE_PO' | 'AUTHORIZE_EXCEPTION'
  | 'AUTHORIZE_QUOTE_CHANGE' | 'REJECT';

interface PaymentGrant {
  readonly id: string;
  readonly authorizationId: string;
  readonly po: DocumentRef;
  readonly invoice: DocumentRef;
  readonly reconciliationId: string;
  readonly quote: QuoteSnapshot;
  readonly enrollmentId: string;
  readonly expiresAt: string;
  readonly state: 'AVAILABLE' | 'RESERVED' | 'CONSUMED' | 'REVOKED' | 'EXPIRED';
}
```

Servicios: `approvePurchase(input, humanActor)`, `recordReview(input, humanActor)`, `decidePayment(input, humanActor)`, `evaluateAutomaticGrant(input)` y `reserveGrant(grantId, paymentIntentId)`. Solo las rutas autenticadas reciben `humanActor` desde sesión. La herramienta del agente puede evaluar permisos existentes, nunca emitir consentimiento humano.

| API | Contrato |
|---|---|
| `POST /api/v1/po-authorizations` | `{ caseId, po, purchasePlanId, enrollmentId, expectedCaseVersion }`; 201 autorización. El servidor carga el plan validado. |
| `POST /api/v1/payment-reviews` | `{ caseId, reconciliationId, expectedCaseVersion }`; 201 revisión. |
| `POST /api/v1/payment-decisions` | `{ caseId, kind, reconciliationId, quoteId, termsHash, justification, expectedCaseVersion }`; 201 decisión. Para REJECT, referencias de términos opcionales. |
| `GET /api/v1/po-authorizations/:id` | Autorización y estado, sin claves privadas. |
| `GET /api/v1/payment-grants/:id` | Permiso y decisión origen. |

Todas las mutaciones usan Idempotency-Key. El handler de workflow resuelve snapshots persistidos y valida el caso; el cliente no puede inventar hashes ni importar una cotización de otro caso. Referencias obsoletas: 409 `STALE_DECISION`; falta de revisión/justificación: 422; acceso del agente a consentimiento humano: 403.

Tablas: `purchase_authorizations`, `payment_reviews`, `payment_decisions`, `payment_grants`, `audit_events`. Decisiones y revisiones append-only. Reserva y creación de intención de pago son atómicas; una exclusión por PO y factura lógicas impide que versiones, nuevas claves HTTP o dos workers creen dos pagos activos/completados. Los IDs de correlación del caso no introducen dependencia del dominio hacia workflow.

El permiso expira en el mínimo entre autorización y cotización. Una reserva en estado desconocido no se libera por tiempo ni por caducidad de la clave HTTP. Solo un fallo terminal verificado sin cargo permite cerrar la intención fallida y evaluar una nueva. Un pago completado consume la autorización de un cargo.

## Stack, comandos, estructura y estilo

[Convenciones comunes](SPEC-CONVENTIONS.md): TypeScript y PostgreSQL/pg. `src/modules/authorization/`; pruebas en `tests/unit/authorization/` y `tests/integration/authorization/`.

```bash
npm run test -- --run tests/unit/authorization tests/integration/authorization
npm run typecheck
npm run lint
npm run build
```

Funciones de política puras, reloj inyectado y transacciones explícitas para reservas. Ejemplo:

```typescript
function isGrantUsable(grant: PaymentGrant, now: Date): boolean {
  return grant.state === 'AVAILABLE' && now < new Date(grant.expiresAt);
}
```

Esta comprobación es una condición necesaria; no reemplaza validar documentos, términos y exclusión de pago dentro de la transacción.

## Pruebas y criterios de éxito

- Una PO sin consentimiento no produce checkout; con aprobación vigente y coincidencia válida avanza sin segundo clic de negocio.
- Revisar una factura discrepante no paga. Autorizarla con justificación conserva diferencias y genera permiso específico.
- Términos, moneda, plan, instrumento, hashes o versiones obsoletos impiden reservar y muestran la causa.
- Caducidad, revocación y nueva versión detienen pagos futuros; no alteran el historial enviado.
- Dos decisiones/reservas concurrentes producen una sola intención; rechazo concurrente no puede prometer detener una ya reservada.
- Una intención UNKNOWN conserva su exclusión. Un fallo verificado permite reintento controlado; COMPLETED bloquea otro cargo.
- `actorId` falsificado, petición sin CSRF y consentimiento invocado como herramienta se rechazan.

## Límites y cuestiones pendientes

Siempre: mostrar condiciones antes de consentimiento, registrar actor/versión/motivo y verificar permiso determinísticamente. Consultar cambios de plazo, pagos parciales, merchant o reglas de excepción. Nunca: autorizar desde el LLM, sobreescribir decisiones ni liberar reservas inciertas.

El plazo de 24 horas y el plan de productos elegido antes de aprobar son propuestas para revisión. La habilitación real de productos y monedas se verifica en [pagos](SPEC-reap-payments.md).
