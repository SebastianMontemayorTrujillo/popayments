# Mapa de capacidades: PoPayments

Estado: mapa y seis specs aprobados por el usuario en esta conversación. Aprobación de specs registrada el 2026-10-09.

## Intención confirmada

Demo de hackathon para Cuentas por Pagar de una empresa de logística que compra equipo a Acteck. Una persona autoriza previamente cada PO. La aplicación recibe PO y factura en JSON o XML y compara referencia de PO, proveedor, moneda y total. Una coincidencia permite iniciar el pago automáticamente bajo esa autorización. Una discrepancia permite revisión humana y aprobación de una excepción con justificación, aunque los documentos conserven sus diferencias.

La demo genera y verifica evidencia criptográfica con mandatos AP2 e identidades de prueba y completa el checkout mediante el módulo Agentic de Reap en sandbox. Acteck es obligatorio; su habilitación para la integración debe verificarse antes de poder demostrar el checkout. Pagos reales, OCR e integración con ERP quedan fuera de esta entrega.

Las decisiones confirmadas en la entrevista prevalecen sobre las ambigüedades de `context.md`: no se requiere un clic humano por cada coincidencia y la revisión manual puede aceptar una excepción sin modificar los documentos originales.

## Módulos aprobados

| Id estable | Responsabilidad | Depende de | Resultado verificable |
|---|---|---|---|
| `documents` | Recibir PO y factura JSON/XML, validar y normalizar sus campos, conservar documentos y versiones. | — | Ambos formatos producen registros comparables y vinculados a sus originales. |
| `reconciliation` | Comparar referencia de PO, proveedor, moneda y total, y describir las diferencias. | `documents` | Una misma pareja produce un resultado reproducible de coincidencia o discrepancia. |
| `authorization` | Registrar aprobación previa de PO, revisión, justificación de excepción, autorización y rechazo; verificar permiso de pago y registrar quién decidió. | `documents`, `reconciliation` | Coincidencias autorizadas avanzan automáticamente; discrepancias avanzan únicamente con una decisión humana registrada. |
| `ap2-evidence` | Generar, vincular y verificar mandatos de checkout y de pago con claves e identidades de prueba y referencias a documentos y autorizaciones. | `documents`, `authorization` | Alterar documentos, condiciones o firmas invalida la evidencia o exige generar y autorizar una nueva versión. |
| `reap-payments` | Integrar enrollment, mandato Reap, cotización, checkout y consulta del resultado en sandbox; manejar aprobaciones adicionales, reintentos y duplicados. | `authorization`, `ap2-evidence` | Un checkout confirmado conserva su referencia de pedido e importe final; un fallo o una respuesta pendiente no se presenta como pago completado. |
| `payment-workflow` | Coordinar el agente y los servicios anteriores y ofrecer la consola de Cuentas por Pagar: carga, autorización de PO, seguimiento, revisión y consulta de evidencia. | Todos los módulos anteriores | La demo recorre coincidencia, excepción y rechazo con estados y acciones comprensibles. |

Orden aprobado: `documents` → `reconciliation` → `authorization` → `ap2-evidence` → `reap-payments` → `payment-workflow`.

Los módulos representan responsabilidades del mismo producto; no implican desplegar seis servicios independientes. Los contratos de entrada y salida se definirán en la spec del módulo que los provee. El coordinador pasa datos de cotización a autorización y evidencia sin introducir una dependencia inversa desde esos módulos hacia el adaptador Reap.

## Condiciones que deben respetar las specs

- La comparación y la validación de autorización y firmas serán deterministas. El agente podrá coordinar herramientas y explicar resultados, pero no decidir por sí solo que una discrepancia es aceptable.
- La aprobación de una excepción no puede reemplazar a Acteck por otro merchant ni eludir las restricciones del mandato de Reap. Los permisos deben corresponder a las condiciones concretas del pago.
- El checkout debe respetar la cotización vigente y el importe autorizado. Si cambia una condición cubierta por la autorización, el flujo debe obtener la autorización correspondiente antes de continuar.
- Si Reap devuelve `nextAction`, la consola debe permitir completar la aprobación alojada por Reap. La ausencia de otra aprobación de negocio tras una coincidencia no garantiza que Reap omita su aprobación.
- Los documentos respaldan la evidencia de compra y autorización. El resultado de conciliación no equivale a comparar dos tokens criptográficos por igualdad.
- Los mandatos AP2 de prueba y el recurso mandate de Reap son elementos distintos. Las firmas locales no se atribuyen a Acteck o Reap; la interoperabilidad AP2 con terceros no se da por probada.
- El equipo proporcionó una tarjeta de sandbox existente. La spec propone enrollment EXTERNAL alojado por Reap; no necesita emitir otra tarjeta. Las credenciales y datos completos de tarjeta no forman parte de estos documentos.
- El usuario confirmó XML propio de la demo. La spec de documentos define ese dialecto y el esquema JSON; no implica compatibilidad con CFDI ni certificación fiscal de una factura.

## Índice de specs

| Módulo | Documento |
|---|---|
| `documents` | [Formato, originales y versiones](SPEC-documents.md) |
| `reconciliation` | [Comparación de cuatro campos](SPEC-reconciliation.md) |
| `authorization` | [Aprobación previa, excepciones y permisos](SPEC-authorization.md) |
| `ap2-evidence` | [Perfil, firmas, delegación y verificación](SPEC-ap2-evidence.md) |
| `reap-payments` | [Enrollment, cotización y checkout](SPEC-reap-payments.md) |
| `payment-workflow` | [Agente, jobs y consola](SPEC-payment-workflow.md) |

[Convenciones compartidas](SPEC-CONVENTIONS.md) y [decisión de arquitectura](docs/decisions/0001-arquitectura-demo.md). Todas las specs incluyen contratos, comandos futuros, estructura, estilo, escenarios verificables y límites. El repositorio aún no contiene la aplicación; no se han ejecutado esos comandos ni realizado checkouts.

## Decisiones aprobadas y verificaciones externas

- Defaults técnicos: stack, plazo de aprobación de 24 horas, perfil AP2/delegación fijado y selección de productos antes de autorizar PO.
- Configuración externa: habilitación de Acteck/Agentic/EXTERNAL, productos y moneda, versión Reap aceptada, owner/email, retorno HTTPS y configuración OpenAI/modelo.
- La llave del sandbox comunicada vence el 11 de octubre de 2026 a las 00:00 de Ciudad de México; una ejecución posterior requiere renovación.

Las specs están aprobadas. El [plan de implementación](tasks/plan.md) y la [lista de tareas](tasks/todo.md) pasan a revisión según la fase Plan de la skill spec-driven-development.

## Fuentes

- [Contexto del proyecto](context.md) y decisiones confirmadas durante la entrevista de esta conversación.
- [Reglas del hackathon](https://aibuilders.mx/reap): Agentic module, sandbox y merchants soportados; referencia revisada durante la entrevista.
- [Reap: compras de una sola vez](https://docs.reap.global/agentic-payments/one-time-purchases): cotización, mandato, checkout, idempotencia, aprobación alojada y resultado final.
- [AP2: especificación](https://ap2-protocol.org/ap2/specification/): roles, mandatos vinculados y verificación determinista.
- [AP2: Checkout Mandate](https://ap2-protocol.org/ap2/checkout_mandate/) y [Payment Mandate](https://ap2-protocol.org/ap2/payment_mandate/).
- [Acteck](https://acteck.com/): merchant elegido; su sitio público no acredita habilitación en Reap.
