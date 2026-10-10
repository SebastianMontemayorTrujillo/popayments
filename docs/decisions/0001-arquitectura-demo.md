# ADR-001: Monolito modular con ejecución durable y evidencia AP2 local

## Estado

Aceptado con la aprobación de las seis specs por el usuario el 2026-10-09. Las verificaciones externas y de compatibilidad siguen pendientes; aprobar la arquitectura no demuestra la integración.

## Fecha

2026-10-09.

## Contexto

La demo autoriza compras a Acteck bajo una PO, revisa excepciones y ejecuta checkout Reap sandbox. El agente, navegador y worker pueden repetir operaciones o interrumpirse. El permiso humano, la evidencia y la intención de pago necesitan referencias coherentes y persistencia entre reinicios. Los mandatos de Reap y AP2 tienen contratos distintos.

## Decisión

Proponer Next.js/TypeScript para consola y API, PostgreSQL para estado compartido y un worker Node para jobs durables. Los seis módulos del [mapa](../../CAPABILITY-MAP.md) son límites de código dentro del mismo producto. Una transacción reserva el permiso y registra la intención antes de enviar checkout; la red queda fuera de la transacción. Se mantienen idempotencia y exclusión de negocio incluso después de la ventana del proveedor.

Una cuenta con sesión opaca atiende la demo. El consentimiento humano ocurre en la consola; el agente usa herramientas con controles deterministas. OpenAI se configura separadamente de Reap.

El perfil AP2 genera y verifica firmas/delegación reales con identidades de prueba locales. Reap recibe su contrato Agentic. Se usan la tarjeta existente y enrollment EXTERNAL alojado, sin emisión propia ni datos completos de tarjeta en la aplicación. El resultado de pago se confirma mediante API; una observación Reap no se convierte en una firma AP2 del proveedor.

## Alternativas consideradas

- Seis servicios independientes: más contratos de red y despliegues para un equipo y demo pequeños; no hacen falta para conservar límites de responsabilidad.
- Jobs únicamente en memoria o en una petición HTTP: una caída pierde trabajo y facilita repetir efectos sin conocer su resultado.
- SQLite y un solo proceso: simplifica instalación, pero el runtime propuesto separa web y worker; PostgreSQL permite compartir reservas y exclusiones entre ellos.
- Redis/broker adicional: añade operación sin una necesidad demostrada para este volumen; jobs/outbox pueden persistirse en la misma base.
- Firma JWT aislada presentada como delegación AP2: no cumple el perfil escogido; se necesitan vínculos y pruebas del borrador fijado.
- Emitir una tarjeta nueva por PO: no es necesario con la tarjeta sandbox disponible y no se dispone de un contrato propio de generación confirmado.

## Consecuencias

- Se requiere PostgreSQL persistente, proceso worker y retorno HTTPS para la demo alojada.
- Los jobs se procesan al menos una vez; los módulos deben manejar repetición y concurrencia.
- Un resultado de checkout desconocido puede bloquear nuevos intentos hasta verificarlo. No se libera por timeout.
- El perfil de delegación necesita vectores independientes y compatibilidad de biblioteca antes de implementarse.
- La disponibilidad de Acteck y configuración del equipo son condiciones externas para demostrar el recorrido completo.
- Las versiones, comandos futuros y escenarios de aceptación están en [convenciones](../../SPEC-CONVENTIONS.md) y las seis specs. No hay aplicación implementada ni integración autenticada probada todavía.
