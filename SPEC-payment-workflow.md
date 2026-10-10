# Spec: payment-workflow — agente y consola de Cuentas por Pagar

Estado: aprobado por el usuario el 2026-10-09. Módulo del [mapa aprobado](CAPABILITY-MAP.md). Depende de los cinco módulos anteriores. Consumidor: aprobador de la demo.

## Objetivo

Ofrecer un recorrido completo y comprensible: cargar PO, seleccionar compra e instrumento, autorizarla, cargar factura, conciliar, pagar automáticamente si procede y revisar excepciones. Mostrar evidencia criptográfica y el resultado real de Reap. El agente coordina herramientas bajo reglas del servidor.

## Experiencia y estados

Rutas: `/login`, `/cases`, `/cases/:id` y `/payments/return`. La lista muestra PO, factura, proveedor, importe, estado y última actividad; filtros por estado y paginación. El detalle presenta documentos/versiones, cuatro verificaciones, decisiones humanas, compra/cotización, progreso de pago y evidencia AP2. La interfaz principal y mensajes están en español.

1. Configurar enrollment con la tarjeta existente mediante Reap alojado; verificar ACTIVE.
2. Crear caso y cargar PO. Resolver variantes de Acteck, configurar envío y seleccionar instrumento. Mostrar términos y «Autorizar PO» con plazo y máximo.
3. Cargar o vincular explícitamente una factura. La vinculación permite discrepancia de referencia, pero advierte antes de confirmar; no adivina por importe. Solo una factura vigente por caso.
4. Conciliar. MATCHED con autoridad vigente inicia cotización, evidencia y checkout automáticamente. Si falta aprobación, espera «Autorizar PO». MISMATCHED muestra diferencias y espera revisión.
5. En discrepancia, «Facturas revisadas» registra revisión; «Autorizar Pago» requiere justificación y términos específicos; «Rechazar Pago» termina antes del envío. Un cambio de quote requiere revisión de términos según authorization.
6. Si Reap pide acción, mostrar «Completar aprobación en Reap» y el estado pendiente. El retorno consulta la API, sin afirmar que la aprobación ya tuvo éxito.
7. COMPLETED muestra «Pago completado (sandbox)», pedido e importe. Fallos y resultados inciertos muestran causa y acción disponible; nunca se anuncian como completados.

La carga de factura puede ocurrir antes de aprobar la PO; no inicia un pago hasta cumplir todas las condiciones. Una nueva versión genera conciliación y autoridad nuevas para efectos futuros. Un caso con pago enviado mantiene las referencias pagadas y bloquea la sustitución de su factura para otro cargo.

Estados del coordinador: `WAITING_PO_AUTH`, `WAITING_INVOICE`, `RECONCILING`, `REVIEW_REQUIRED`, `QUOTE_REVIEW_REQUIRED`, `READY_FOR_PAYMENT`, `PAYING`, `REAP_ACTION_REQUIRED`, `PROCESSING`, `COMPLETED`, `REJECTED`, `FAILED`, `UNKNOWN`, `BLOCKED_CONFIGURATION`. Son proyecciones de registros de los módulos, no prueba independiente de pago. Al consultar, el servidor puede reconstruirlos a partir de autoridad, reconciliación e intención persistidas.

No usar verde de éxito para «Documentos coinciden» como si fuera un cargo. Botones tienen loading, explicación cuando están deshabilitados y prevención de doble clic; el servidor conserva la protección. Diseño responsive desde 360 px, sin scroll horizontal de página; tablas extensas en su región. Labels y errores vinculados, navegación por teclado, foco visible, estados con texto además de color y contraste WCAG AA. Actualizaciones en `aria-live` sin robar foco. Direcciones y documentos se muestran como texto, sin HTML activo.

## Agente y herramientas

Responses API con function calling, `strict: true`, schemas sin propiedades adicionales y `parallel_tool_calls: false`. Cada ejecución maneja function_call y devuelve function_call_output por call_id. El modelo se configura por `OPENAI_MODEL`; API key de OpenAI independiente, disponible antes de demostrar el agente. [OpenAI: function calling](https://developers.openai.com/api/docs/guides/function-calling).

Herramientas permitidas: `get_case`, `reconcile_documents`, `resolve_purchase_plan`, `create_quote`, `evaluate_payment_grant`, `bind_ap2_evidence`, `execute_checkout` y `get_payment_status`. El servidor comprueba tenant, versión de caso, estado y permiso en cada invocación. Resolver un plan no lo aprueba. `execute_checkout` recibe IDs de permiso/evidencia, no importe libre, tarjeta ni URL de pago.

No hay herramientas de autorización humana, escritura libre de SQL, shell, navegación de checkout ni firma genérica. El modelo recibe IDs, los cuatro campos normalizados, diferencias y estado; descripciones de documentos son datos no confiables. No recibe originales completos, direcciones, secretos o tokens de tarjeta. Texto que ordena ignorar controles se trata como contenido del documento. Ninguna elección del LLM modifica las reglas deterministas.

Límite por ejecución: diez llamadas a herramientas y 60 segundos; al alcanzar el límite se guarda el estado y se reanuda mediante job. Un error de OpenAI conserva los jobs y permite reintentar coordinación. La consola puede consultar decisiones/estados sin modelo; el recorrido presentado como agente requiere una ejecución real con herramientas registrada, sin reemplazarla por texto simulado. La explicación nunca prevalece sobre el estado del servidor.

## Orquestación durable y contratos

El coordinador pasa snapshots de Reap a authorization y ap2-evidence; los módulos inferiores no importan workflow. Jobs en PostgreSQL con `kind`, entidad, versión esperada, `runAt`, intentos y lease. Reclamar trabajo con `FOR UPDATE SKIP LOCKED`, liberar transacción antes de llamar a proveedores y persistir resultados por pasos. Eventos/outbox y cambio de estado se escriben juntos. Lease recuperable tras caída; operaciones de pagos se deduplican por intención, no por lease. [PostgreSQL: SELECT y locking](https://www.postgresql.org/docs/17/sql-select.html).

No mantener transacciones SQL abiertas durante HTTP/LLM. El worker ejecuta al menos una vez: cada consumidor debe ser idempotente. Las decisiones humanas y el envío verifican una versión optimista del caso; los efectos ya enviados conservan snapshots. Poll del checkout cada cinco segundos durante dos minutos, después cada 30 segundos hasta 15 minutos; continuar pendiente permite refresh manual y jobs más espaciados, sin declarar fallo por timeout. Jobs de consulta no crean checkouts.

```typescript
interface CaseSummary {
  readonly id: string;
  readonly version: number;
  readonly state: WorkflowState;
  readonly po: DocumentRef | null;
  readonly invoice: DocumentRef | null;
  readonly paymentIntentId: string | null;
  readonly availableActions: readonly string[];
}
```

| API | Contrato |
|---|---|
| `POST /api/v1/session` | Login, sesión y CSRF; error de credenciales uniforme. |
| `DELETE /api/v1/session` | Cerrar sesión actual. |
| `GET /api/v1/session` | Aprobador actual y CSRF; sin hash de contraseña. |
| `POST /api/v1/cases` | `{ title }`; 201 caso vacío. |
| `GET /api/v1/cases` | Lista paginada y filtro por estado. |
| `GET /api/v1/cases/:id` | Resumen, acciones y vistas de módulos. |
| `POST /api/v1/cases/:id/documents` | `{ role: "PO" | "INVOICE", document: DocumentRef, expectedCaseVersion }`; vincula y encola evento. |
| `GET /api/v1/cases/:id/events` | Historial paginado con actores, decisiones y herramientas saneadas. |
| `POST /api/v1/cases/:id/resume` | 202 coordinación encolada; no crea permiso humano ni un cargo alternativo. |

Las APIs de módulos siguen sus specs y se exponen a través de handlers que validan el caso. Errores, sesiones e Idempotency-Key según [convenciones](SPEC-CONVENTIONS.md). Rate limit propuesto login: cinco intentos por minuto por usuario/IP, con pausa temporal, sin bloquear permanentemente la cuenta.

Tablas: `cases`, `case_document_links`, `workflow_jobs`, `workflow_outbox`, `agent_runs`, `agent_tool_events`, `demo_users`, `sessions`, `provider_return_states`. Trazabilidad por requestId, caseId, jobId y paymentIntentId. Logs de herramientas contienen nombre, IDs, duración y resultado saneado; sin prompt/documento completo ni credenciales. Retorno alojado exige correlación válida; sesión caducada conduce a login y después a consulta del caso.

## Stack, comandos, estructura y estilo

[Convenciones comunes](SPEC-CONVENTIONS.md). Next.js/React para UI/API, worker Node, OpenAI SDK y PostgreSQL. UI en `src/app/`, dominio/tools en `src/modules/payment-workflow/`, worker en `src/workers/`. Pruebas unitarias e integración propias; recorridos en `tests/e2e/`.

```bash
npm run dev
npm run worker
npm run test -- --run tests/unit/payment-workflow tests/integration/payment-workflow
npm run test:e2e
npm run typecheck
npm run lint
npm run build
```

Ejemplo de estilo: no construir permisos a partir de texto generado.

```typescript
async function executeCheckoutTool(input: CheckoutToolInput): Promise<PaymentOutcome> {
  await workflowPolicy.assertCanExecute(input.caseId, input.grantId);
  return payments.executePayment({ grantId: input.grantId, evidenceId: input.evidenceId });
}
```

## Pruebas y criterios de éxito

- Playwright: PO autorizada y factura coincidente avanzan sin otro consentimiento de negocio; caso discrepante revisado/autorizado conserva diferencias; rechazo produce cero checkout.
- Cotización distinta obliga a revisión; una acción Reap aparece pendiente y solo GET confirmado produce COMPLETED.
- Recargar navegador, reiniciar worker y repetir evento conservan decisiones y una sola intención; dos jobs concurrentes no duplican cargo.
- Documento con instrucciones maliciosas y llamadas inválidas del modelo no crean consentimiento ni acceso a otro caso.
- Un modelo falla/agota límite y puede reanudar; el usuario ve estado persistido y causa, sin éxito inventado.
- UI funciona por teclado y a 360/768/1440 px; errores anunciados, foco visible, estados no dependen del color. Verificación automatizada complementada por revisión manual.
- Sandbox: recorrido con Acteck, evidencia verificable y pedido/importe consultado. Tests con doubles prueban aplicación, no acreditan esta integración.

## Límites y cuestiones pendientes

Siempre: derivar acciones del servidor, conservar jobs y mostrar causa de bloqueo. Consultar multiempresa, roles adicionales, chat abierto, otro modelo/proveedor que cambie contratos o acciones fuera de alcance. Nunca: ejecutar consentimiento humano desde tools, confiar en callbacks para confirmar pago o esconder que la integración está bloqueada.

Configuración externa pendiente: acceso OpenAI/modelo, URL HTTPS y PostgreSQL persistente, junto con requisitos Reap enumerados en su spec. Si falta configuración se ofrece diagnóstico visible y no se afirma que la demo completa ya funciona.
