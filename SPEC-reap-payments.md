# Spec: reap-payments — checkout Agentic en sandbox

Estado: aprobado por el usuario el 2026-10-09. Módulo del [mapa aprobado](CAPABILITY-MAP.md). Depende de [authorization](SPEC-authorization.md) y [ap2-evidence](SPEC-ap2-evidence.md). Consumidor: workflow.

## Objetivo

Completar una compra autorizada de equipo a Acteck mediante Agentic Payments de Reap en sandbox y conservar checkout, pedido e importe final. El sistema debe distinguir autorización, aprobación alojada, procesamiento, fallo y finalización confirmada, y recuperarse sin duplicar un cargo.

## Configuración y tarjeta del equipo

El usuario proporcionó una tarjeta sandbox existente y credenciales del equipo. Se propone enrollment `EXTERNAL`: la persona introduce tarjeta y verificación únicamente en la página alojada por Reap. La aplicación conserva enrollmentId y metadatos enmascarados. No requiere emitir otra tarjeta ni una API propia de generación. La referencia actual marca REAP_CARD/BIN_SPONSOR como pendientes aunque la guía de setup muestra ejemplos de ellos; se elige EXTERNAL y se valida su habilitación real. [Create enrollment](https://docs.reap.global/api-reference/agentic/create-enrollment).

Base del equipo: `https://sg.sandbox.api.reap.global`. `REAP_VERSION` es configuración obligatoria; la referencia consultada enumera `2025-02-14`, valor propuesto sujeto a comprobar con el sandbox. Se envían Authorization Bearer desde servidor y la versión explícita. La clave comunicada vence `2026-10-11T00:00:00-06:00`; a partir de ese momento las mutaciones se bloquean hasta disponer de configuración renovada. Un 401/403 bloquea configuración, sin reintentos indefinidos.

Antes del recorrido se necesitan Agentic habilitado, identidad de propietario/email del equipo, URL de retorno HTTPS, enrollment ACTIVE, Acteck soportado y productos/moneda disponibles. No se infiere que Acteck está habilitado a partir de su sitio web. Si no está disponible, se informa `BLOCKED_CONFIGURATION`; la demo no sustituye el merchant ni presenta un doble como éxito real. [Reglas del evento](https://aibuilders.mx/reap) y [setup Reap](https://docs.reap.global/agentic-payments/setup).

## Contratos del proveedor

Enrollment: `POST /agentic/enrollments` con la siguiente forma, usando únicamente valores ficticios en documentación:

```json
{
  "source": "EXTERNAL",
  "owner": { "type": "CLIENT_REFERENCE", "id": "demo-owner", "email": "team@example.com" },
  "presentation": { "type": "REDIRECT", "returnUrl": "https://demo.example/payments/return?state=opaque" }
}
```

El retorno se correlaciona con un nonce opaco persistido, asociado a sesión y operación. Después se consulta `GET /agentic/enrollments/{id}`; únicamente ACTIVE permite pagar. No se pide PAN/CVV/OTP en formularios propios. El enrollment seleccionado debe pertenecer al propietario de la demo.

Los destinos alojados adicionales se habilitan mediante `REAP_REDIRECT_ORIGINS`: orígenes HTTPS exactos, confirmados en la respuesta autenticada del proveedor y configurados por el operador. El sandbox del equipo devolvió `https://sandbox.collect.prava.space`. La lista no admite coincidencias parciales ni comodines; los enlaces con credenciales embebidas se rechazan. Un destino no permitido produce `REAP_REDIRECT_NOT_ALLOWED` sin exponer su ruta ni sus tokens. La solicitud pendiente conserva su clave para recuperarse con el mismo intento.

La tarjeta predeterminada se configura localmente mediante últimos cuatro dígitos y vencimiento. `GET /api/v1/payment-method`, autenticado, devuelve esos metadatos y `PENDING_ENROLLMENT` hasta encontrar un enrollment `ACTIVE` del propietario con datos coincidentes. La autorización de una PO vuelve a consultar Reap y exige esa selección. Se persiste únicamente `type`, `network`, `last4`, `expiryMonth` y `expiryYear` de `paymentMethod`; se descartan campos adicionales. Sin preferencia configurada, se elige una tarjeta activa con metadatos del proveedor.

Productos: usar búsqueda, detalle y resolución de variantes de Agentic para construir un `PurchasePlan` de Acteck. El adaptador devuelve IDs y cantidades verificadas; no acepta un SKU del documento como si fuera un variantId. El plan aprobado admite como máximo 20 variantes distintas para ajustarse a la API; una PO puede tener más partidas pero no aprobar un plan no representable.

Cotización: `POST /agentic/quotes` con `{ email, items: [{ variantId, quantity }], shippingAddress }`. Dirección y email proceden de configuración humana. Se usa la modalidad `items` de Reap discovery; `externalCheckout` queda fuera de la primera demo. Se conserva la respuesta y se transforma a QuoteSnapshot. Si se selecciona envío mediante `POST /agentic/quotes/{id}/shipping-option`, se consulta de nuevo el quote y se actualizan términos antes de consentir. No se combina `items` con `externalCheckout`. [Create quote](https://docs.reap.global/api-reference/agentic/create-quote) y [select shipping option](https://docs.reap.global/api-reference/agentic/select-shipping-option).

Checkout: `POST /agentic/checkouts` con `{ quoteId, enrollmentId, presentation: { type: "REDIRECT", returnUrl } }`. No se inventa un endpoint de creación de mandate: el recurso mandate de Reap pertenece a su flujo alojado. Si un ID de mandate está disponible, se consulta y conserva su estado/restricciones mediante GET; no se fabrica un ID ni se equipara al mandato AP2 local. [Create checkout](https://docs.reap.global/api-reference/agentic/create-checkout) y [get mandate](https://docs.reap.global/api-reference/agentic/get-mandate).

`nextAction` requiere intervención alojada por Reap, incluso después de aprobar la PO en la aplicación. La API de referencia describe ese paso; el tutorial también contempla permisos que permiten continuar sin redirect. El código atiende la respuesta real. La vuelta del navegador solo dispara una consulta. `GET /agentic/checkouts/{id}` confirma estados REQUIRES_ACTION, PROCESSING, COMPLETED, FAILED o EXPIRED. COMPLETED debe conservar orderId y finalAmount. [Get checkout](https://docs.reap.global/api-reference/agentic/get-checkout).

## Ejecución, dinero y recuperación

Antes de enviar: releer enrollment y cotización, verificar vigencia, propietario, Acteck y términos; verificar evidencia AP2 y permiso actual. Reservar permiso e intención en transacción. Persistir cuerpo exacto, hash y clave Reap antes de la petición. Tras la reserva se vuelven a comprobar vigencia y evidencia en el contexto de esa intención; si vencieron antes de enviar, abortar sin efecto y cerrar la reserva de forma comprobable.

El adaptador convierte entre dinero interno entero y unidades mayores del proveedor usando representación decimal exacta. Debe rechazar importes no representables, decimales excesivos o respuesta contradictoria. Nunca convertir con `Math.round(amount * 100)`. El importe autorizado incluye todos los cargos; no hay conversión MXN/USD.

Reap conserva idempotencia 24 horas. Timeout/5xx después de envío dejan la intención UNKNOWN o pendiente: dentro de la ventana se puede repetir el mismo cuerpo con la misma clave, nunca otra. Si hay checkoutId, consultar estado. Fuera de la ventana, una intención sin resultado conocido bloquea una nueva creación hasta comprobar el resultado con Reap; la expiración de la caché no demuestra ausencia de cargo. [Idempotencia Reap](https://docs.reap.global/api-reference/idempotency).

Retries transitorios: hasta cinco intentos, backoff 1/2/4/8/16 segundos con jitter, respetando Retry-After y la ventana de idempotencia. Agotar intentos no convierte UNKNOWN en FAILED. Un fallo terminal verificado permite cerrar la intención sin cargo; una nueva intención exige nueva cotización/evidencia y permiso vigente. Se guardan estados monotónicos: una respuesta tardía PROCESSING no revierte COMPLETED.

Si Reap informa COMPLETED con importe distinto al autorizado, se registra que el pago ocurrió, se consume/excluye otro cargo y se activa una alerta `POST_PAYMENT_AMOUNT_MISMATCH`. No se inventa éxito conforme a autorización ni se intenta compensar con otro pago. El caso se presenta como «Pago completado con diferencia de importe».

## API interna y datos

```typescript
type PaymentStatus = 'RESERVED' | 'SUBMITTING' | 'UNKNOWN'
  | 'REQUIRES_ACTION' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

interface PaymentOutcome {
  readonly paymentIntentId: string;
  readonly status: PaymentStatus;
  readonly checkoutId: string | null;
  readonly orderId: string | null;
  readonly finalAmount: Money | null;
}
```

Servicios `createExternalEnrollment`, `refreshEnrollment`, `resolvePurchasePlan`, `createQuote`, `executePayment({ grantId, evidenceId })` y `refreshPayment(paymentIntentId)`. La cotización se devuelve al coordinador para autorización/evidencia; no se introduce dependencia inversa hacia Reap.

| API | Resultado |
|---|---|
| `POST /api/v1/enrollments` | 201 registro y acción alojada; input sin tarjeta, propietario resuelto desde configuración. |
| `GET /api/v1/enrollments/:id` | Estado consultado y tarjeta enmascarada. |
| `POST /api/v1/purchase-plans` | `{ caseId, po, selections: [{ sku, variantId, quantity }], shippingAddressId }`; valida productos de Acteck y devuelve 201 plan persistido con hash. |
| `POST /api/v1/quotes` | `{ caseId, purchasePlanId }`; 201 snapshot validado. |
| `GET /api/v1/quotes/:id` | Cotización persistida y vigencia. |
| `GET /api/v1/payments/:id` | Estado, pedido, importe y alerta. |
| `POST /api/v1/payments/:id/refresh` | 202 consulta encolada; nunca crea otro checkout. |

Crear checkout es una operación interna protegida, sin endpoint que acepte importe o PAN desde navegador. Mutaciones públicas autenticadas con Idempotency-Key. Tablas: `reap_enrollments`, `purchase_plans`, `reap_quotes`, `payment_intents`, `provider_requests`, `payment_status_events`. Respuestas se sanean antes de persistir/loguear. URLs nextAction se consideran datos sensibles y solo se muestran al aprobador autenticado; validar HTTPS y hosts de Reap confirmados en setup.

## Stack, comandos, estructura y estilo

[Convenciones comunes](SPEC-CONVENTIONS.md). Cliente HTTP Node con timeout de 15 segundos, validadores de respuesta y repositorios SQL en `src/modules/reap-payments/`. Pruebas en `tests/unit/reap-payments/`, `tests/integration/reap-payments/` y `tests/sandbox/`.

```bash
npm run test -- --run tests/unit/reap-payments tests/integration/reap-payments
npm run test:sandbox -- --run tests/sandbox/reap-payments
npm run typecheck
npm run lint
npm run build
```

Ejemplo de estilo: estado discriminado y efecto explícito, sin asumir éxito de una respuesta HTTP.

```typescript
if (checkout.status === 'REQUIRES_ACTION') {
  return persistRequiredAction(intent.id, checkout.nextAction);
}
```

## Pruebas y criterios de éxito

- Enrollment alojado y GET ACTIVE habilitan el instrumento; retorno sin ACTIVE no lo habilita.
- Merchant no disponible, clave caducada, quote vencido, moneda no representable o evidencia inválida impiden envío con causa visible.
- Plan no aprobado y variación de cotización requieren nuevo consentimiento; items de factura no alteran la comparación documental.
- Dos workers, doble clic y timeout con reinicio mantienen una clave/cuerpo y una intención; recuperación fuera de 24 horas no crea cargo incierto.
- nextAction conduce a aprobación alojada; callback falsificado no marca COMPLETED.
- GET COMPLETED conserva pedido e importe; importe distinto registra alerta y bloquea otro cargo.
- Tests por defecto no llaman a Reap. El test sandbox requiere opt-in y configuración del equipo; usa checkout simulado del proveedor y muestra «sandbox».

Reap documenta `X-Simulate-Checkout: COMPLETED`, rechazado en producción. Se puede activar explícitamente en sandbox después de pasar todos los permisos; el resultado se verifica con GET. No se envía a otro host ni se usa un mock local como prueba de integración. [Create checkout](https://docs.reap.global/api-reference/agentic/create-checkout).

## Límites y cuestiones pendientes

Siempre: verificar estado por API, conservar la exclusión local de pago y limitar hosts a sandbox. Consultar producción, emisión de tarjetas, externalCheckout, otro merchant o moneda. Nunca: almacenar tarjeta completa, usar credenciales en browser/LLM, reintentar un cargo incierto con nueva clave o eludir nextAction.

Requisitos externos por verificar: Agentic/EXTERNAL habilitados, Acteck y variantes disponibles, moneda de checkout, owner/email de prueba, URL HTTPS, versión aceptada y renovación de llave si se ejecuta después de su expiración. No se han realizado peticiones autenticadas ni checkouts al redactar la spec.
