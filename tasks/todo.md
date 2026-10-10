# Tareas de implementación: PoPayments

Estado: lista propuesta para revisión junto con [plan.md](plan.md). Specs aprobadas el 2026-10-09. Todas las tareas siguen pendientes; no hay código implementado. IDs estables T01–T45.

## Reglas de ejecución

- Ejecutar en orden y respetar dependencias; registrar evidencias antes de marcar cada tarea.
- Cada tarea cambia como máximo cinco archivos previstos. Si el alcance crece, dividirla conservando trazabilidad y revisar el plan antes de una ampliación material.
- Las migraciones incluyen únicamente el esquema de la capacidad actual. Los adaptadores de proveedor simulados viven en tests; producción bloquea las capacidades sin configuración.
- Después de crear los scripts, cada checkpoint verifica tipos, lint y build, más las pruebas afectadas y el recorrido habilitado. Un checkpoint no pide otra aprobación humana de rutina.
- Un impedimento externo se registra con causa y estado; no se marca T44 completada por pasar tests con doubles. La implementación comienza después de aprobar el plan.

## Fase: Preparación

### T01: Diagnóstico de configuración externa

- [ ] Completada T01.

**Descripción:** Registrar qué requisitos externos están disponibles antes de comprometer el recorrido de sandbox.

**Dependencias:** Ninguna.

**Criterios de aceptación:**

- [ ] Documentar Agentic/EXTERNAL, Acteck, variantes/moneda y versión como disponibles, bloqueados o desconocidos, con evidencia pública o consultas autorizadas de lectura.
- [ ] Identificar owner/email, envío, HTTPS, runtime y OpenAI/modelo pendientes; no copiar secretos ni efectuar enrollment/checkout.

**Verificación:** Revisión del diagnóstico y de los contratos oficiales; las consultas no mutan proveedores.

**Archivos previstos (2):** `docs/readiness.md`, `tests/fixtures/reap/contracts.json`.

**Tamaño:** Pequeño; una sesión enfocada.

### T02: Dependencias y configuración TypeScript

- [ ] Completada T02.

**Descripción:** Crear la configuración mínima del proyecto con versiones exactas y lockfile.

**Dependencias:** Ninguna.

**Criterios de aceptación:**

- [ ] Instalar las versiones aprobadas y @sd-jwt/core 0.22.0; registrar incompatibilidades antes de sustituir dependencias.
- [ ] TypeScript estricto, Next y lint se configuran sin supresiones; npm ci reproduce la instalación.

**Verificación:** `npm ci`; inspeccionar resolución de versiones y `npx tsc --showConfig`.

**Archivos previstos (5):** `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T03: Configuración segura del runtime

- [ ] Completada T03.

**Descripción:** Separar variables públicas y privadas y preparar ejemplos ficticios para desarrollo.

**Dependencias:** T02.

**Criterios de aceptación:**

- [ ] Validar env obligatorias por función: la ausencia de proveedores permite diagnóstico, pero bloquea sus efectos.
- [ ] Ignorar env locales, claves privadas y artefactos; el ejemplo no contiene tarjeta ni credenciales reales.

**Verificación:** `npm run test -- --run tests/unit/shared/config.test.ts`; inspeccionar el ejemplo y git status.

**Archivos previstos (4):** `.gitignore`, `.env.example`, `src/shared/config.ts`, `tests/unit/shared/config.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T03

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

### T04: PostgreSQL y runner de migraciones

- [ ] Completada T04.

**Descripción:** Habilitar una base persistente y migraciones reproducibles sin implementar todo el esquema de negocio.

**Dependencias:** T03.

**Criterios de aceptación:**

- [ ] Compose inicia PostgreSQL 17; conexión parametrizada y transacciones se cierran ante errores.
- [ ] Runner registra migraciones aplicadas y detecta alteraciones; repetir migrate no duplica operaciones.

**Verificación:** `docker compose up -d db`; `npm run db:migrate` dos veces; comprobar persistencia tras reiniciar db.

**Archivos previstos (5):** `compose.yaml`, `src/shared/database.ts`, `scripts/migrate.ts`, `db/migrations/0001-bootstrap.sql`, `package.json`.

**Tamaño:** Mediano; una sesión enfocada.

### T05: Consola web mínima

- [ ] Completada T05.

**Descripción:** Crear el layout y una página de estado que comprueben que Next inicia en este runtime.

**Dependencias:** T02, T03.

**Criterios de aceptación:**

- [ ] La app responde en español y presenta configuración incompleta sin revelar secretos.
- [ ] Layout responsive y estilos base usan HTML semántico; rutas de negocio todavía no aparentan estar implementadas.

**Verificación:** `npm run dev`; abrir la página y comprobar respuesta; `npm run build`.

**Archivos previstos (4):** `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/error.tsx`.

**Tamaño:** Mediano; una sesión enfocada.

### T06: Herramientas de verificación

- [ ] Completada T06.

**Descripción:** Configurar Vitest, Playwright y una base aislada para tests de contratos/persistencia.

**Dependencias:** T04, T05.

**Criterios de aceptación:**

- [ ] Scripts separan unit/integration, navegador y sandbox opt-in; las suites normales no usan proveedores reales.
- [ ] Tests usan DB de prueba aislada y clocks controlables; hay smoke del runtime y página.

**Verificación:** `npm run test -- --run tests/integration/runtime.test.ts`; `npm run test:e2e -- tests/e2e/smoke.spec.ts`.

**Archivos previstos (5):** `vitest.config.ts`, `playwright.config.ts`, `tests/integration/runtime.test.ts`, `tests/e2e/smoke.spec.ts`, `package.json`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T06

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

### T07: Dinero y serialización de evidencia

- [ ] Completada T07.

**Descripción:** Implementar primitivas compartidas para contratos y hashes deterministas.

**Dependencias:** T06.

**Criterios de aceptación:**

- [ ] Money compara enteros de texto, rechaza valores inválidos y conserva precisión.
- [ ] Canonical JSON y SHA-256 base64url son reproducibles; errores HTTP siguen el envelope aprobado.

**Verificación:** `npm run test -- --run tests/unit/shared/primitives.test.ts`; probar centavos y orden de claves.

**Archivos previstos (4):** `src/shared/money.ts`, `src/shared/canonical-json.ts`, `src/shared/errors.ts`, `tests/unit/shared/primitives.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T08: Viabilidad del perfil SD-JWT delegado

- [ ] Completada T08.

**Descripción:** Comprobar temprano el contrato de biblioteca y la serialización del borrador fijado con un ensayo acotado.

**Dependencias:** T02, T06, T07.

**Criterios de aceptación:**

- [ ] Vectores independientes comprueban SD-JWT, vínculo sd_hash y prueba de posesión del perfil fijado; modificar el payload se rechaza.
- [ ] Registrar capacidades que requieren la capa AP2; si el perfil no es viable, bloquear esa capacidad y revisar spec sin degradarla.

**Verificación:** `npm run test -- --run tests/unit/ap2-evidence/profile-feasibility.test.ts`; inspeccionar tokens/vectores y reporte.

**Archivos previstos (3):** `tests/unit/ap2-evidence/profile-feasibility.test.ts`, `tests/fixtures/ap2/profile-vectors.json`, `docs/ap2-compatibility.md`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T08

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

## Fase: Acceso y documentos

### T09: Sesiones del aprobador

- [ ] Completada T09.

**Descripción:** Crear autenticación de una cuenta y sesiones opacas persistidas.

**Dependencias:** T04, T06, T07.

**Criterios de aceptación:**

- [ ] Contraseña scrypt, sesión de ocho horas, logout y cookies/CSRF/Origin se comportan según spec.
- [ ] Credenciales incorrectas producen error uniforme y rate limit; el servidor resuelve actorId.

**Verificación:** `npm run test -- --run tests/integration/session.test.ts`; probar expiración, CSRF y logout por HTTP.

**Archivos previstos (5):** `db/migrations/0002-sessions.sql`, `src/shared/session.ts`, `src/app/api/v1/session/route.ts`, `tests/integration/session.test.ts`, `scripts/seed-demo.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T10: Login de la consola

- [ ] Completada T10.

**Descripción:** Permitir al aprobador entrar y salir desde una pantalla accesible.

**Dependencias:** T05, T09.

**Criterios de aceptación:**

- [ ] Login muestra errores vinculados y establece sesión; rutas privadas conducen a login cuando falta sesión.
- [ ] Logout revoca sesión; una sesión caducada permite volver al caso tras autenticarse.

**Verificación:** `npm run test:e2e -- tests/e2e/login.spec.ts`; recorrido de teclado y expiración.

**Archivos previstos (4):** `src/app/login/page.tsx`, `src/app/cases/layout.tsx`, `src/app/components/session-controls.tsx`, `tests/e2e/login.spec.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T10

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

### T11: Esquema y lectura JSON

- [ ] Completada T11.

**Descripción:** Validar el esquema de documentos v1 y normalizarlo sin perder identidad.

**Dependencias:** T07.

**Criterios de aceptación:**

- [ ] JSON acepta solo campos aprobados, límites de tamaño/profundidad y claves no duplicadas.
- [ ] Normalización NFC/trim y dinero es determinista; referencias preservan case y datos originales.

**Verificación:** `npm run test -- --run tests/unit/documents/json.test.ts`; tabla de entradas válidas e inválidas.

**Archivos previstos (5):** `src/modules/documents/contracts.ts`, `src/modules/documents/schema.ts`, `src/modules/documents/read-json.ts`, `tests/unit/documents/json.test.ts`, `tests/fixtures/documents/po.json`.

**Tamaño:** Mediano; una sesión enfocada.

### T12: Lectura de XML propio

- [ ] Completada T12.

**Descripción:** Convertir el dialecto XML aprobado al mismo contrato normalizado de JSON.

**Dependencias:** T11.

**Criterios de aceptación:**

- [ ] Namespace, atributos y cardinalidad siguen el esquema; DTD/XXE/XInclude y campos repetidos/desconocidos fallan.
- [ ] XML equivalente produce el mismo canonicalHash; no hay resolución de red ni pérdida de precisión.

**Verificación:** `npm run test -- --run tests/unit/documents/xml.test.ts`; verificar equivalencia y entradas adversarias.

**Archivos previstos (4):** `src/modules/documents/read-xml.ts`, `src/modules/documents/read-document.ts`, `tests/unit/documents/xml.test.ts`, `tests/fixtures/documents/po.xml`.

**Tamaño:** Mediano; una sesión enfocada.

### T13: Carga persistente de originales

- [ ] Completada T13.

**Descripción:** Exponer carga autenticada con originales y referencias inmutables.

**Dependencias:** T04, T09, T11, T12.

**Criterios de aceptación:**

- [ ] Upload guarda bytes, formatos, actor y hashes; archivos inválidos no producen versiones válidas.
- [ ] Misma clave/contenido y cargas concurrentes idénticas devuelven el mismo resultado; conflictos siguen API común.

**Verificación:** `npm run test -- --run tests/integration/documents/upload.test.ts`; enviar JSON/XML multipart por HTTP.

**Archivos previstos (5):** `db/migrations/0003-documents.sql`, `src/modules/documents/repository.ts`, `src/shared/http-idempotency.ts`, `src/app/api/v1/documents/route.ts`, `tests/integration/documents/upload.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T13

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

### T14: Versiones y descarga autenticada

- [ ] Completada T14.

**Descripción:** Conservar revisiones append-only y permitir consultar/descargar referencias exactas.

**Dependencias:** T13.

**Criterios de aceptación:**

- [ ] Una revisión válida crea versión nueva y evento durable; originales anteriores permanecen íntegros.
- [ ] La consulta/descarga verifica sesión y empresa; uploads no reasignan una factura a otra PO.

**Verificación:** `npm run test -- --run tests/integration/documents/versions.test.ts`; comprobar original y conflictos.

**Archivos previstos (5):** `src/modules/documents/versions.ts`, `src/app/api/v1/documents/[id]/route.ts`, `src/app/api/v1/documents/[id]/versions/route.ts`, `src/app/api/v1/documents/[id]/versions/[version]/[[...view]]/route.ts`, `tests/integration/documents/versions.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T15: Caso con documentos vinculados

- [ ] Completada T15.

**Descripción:** Entregar la primera capacidad visible: crear caso, cargar/vincular PO y factura y consultar versiones.

**Dependencias:** T10, T14.

**Criterios de aceptación:**

- [ ] Lista paginada y detalle muestran documentos/versiones con vínculo explícito; referencia discrepante exige aviso.
- [ ] Una factura vigente y expectedCaseVersion se validan; no se admite reasignación de un caso pagado.

**Verificación:** `npm run test:e2e -- tests/e2e/documents.spec.ts`; carga JSON/XML y consulta del original.

**Archivos previstos (5):** `db/migrations/0004-cases.sql`, `src/modules/payment-workflow/cases.ts`, `src/app/api/v1/cases/[[...path]]/route.ts`, `src/app/cases/[[...path]]/page.tsx`, `tests/e2e/documents.spec.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T15

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

## Fase: Conciliación y autorización

### T16: Comparador de cuatro campos

- [ ] Completada T16.

**Descripción:** Persistir resultados reproducibles de conciliación para referencias explícitas.

**Dependencias:** T14, T15.

**Criterios de aceptación:**

- [ ] Solo PO ref, supplierId, currency y minorUnits determinan MATCHED/MISMATCHED; partidas se ignoran.
- [ ] Tipos/versiones inválidos fallan; repetir la pareja no duplica resultado ni decisiones.

**Verificación:** `npm run test -- --run tests/unit/reconciliation tests/integration/reconciliation`.

**Archivos previstos (5):** `db/migrations/0005-reconciliation.sql`, `src/modules/reconciliation/contracts.ts`, `src/modules/reconciliation/service.ts`, `tests/unit/reconciliation/headers.test.ts`, `tests/integration/reconciliation/persistence.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T17: Diferencias en la consola

- [ ] Completada T17.

**Descripción:** Exponer el resultado de conciliación y su representación verificable en el caso.

**Dependencias:** T16.

**Criterios de aceptación:**

- [ ] API comprueba las referencias del caso; UI presenta ambas columnas, las cuatro verificaciones y causas completas.
- [ ] MATCHED no se presenta como pago; revisión pendiente no altera el resultado documental.

**Verificación:** `npm run test:e2e -- tests/e2e/reconciliation.spec.ts`; revisar cada diferencia y teclado.

**Archivos previstos (4):** `src/app/api/v1/reconciliations/[[...path]]/route.ts`, `src/app/cases/components/reconciliation-panel.tsx`, `src/app/cases/[[...path]]/page.tsx`, `tests/e2e/reconciliation.spec.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T18: Consentimiento previo de PO

- [ ] Completada T18.

**Descripción:** Implementar autoridad de compra versionada sobre un plan validado que aporta el coordinador.

**Dependencias:** T16, T09.

**Criterios de aceptación:**

- [ ] Autoridad liga PO/hashes, Acteck, plan, instrumento, moneda, máximo y plazo de 24 horas con un cargo.
- [ ] Actor humano viene de sesión; datos obsoletos o un plan no validado fallan; ninguna herramienta emite consentimiento.

**Verificación:** `npm run test -- --run tests/integration/authorization/purchase.test.ts`; comprobar caducidad y actor.

**Archivos previstos (5):** `db/migrations/0006-authorization.sql`, `src/modules/authorization/contracts.ts`, `src/modules/authorization/purchase.ts`, `src/modules/authorization/repository.ts`, `tests/integration/authorization/purchase.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T18

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

### T19: Revisión y decisión de excepción

- [ ] Completada T19.

**Descripción:** Registrar revisión, aceptación justificada y rechazo sin modificar los documentos.

**Dependencias:** T18.

**Criterios de aceptación:**

- [ ] Revisión por sí sola no autoriza; excepción/cambio de quote exigen términos explícitos y justificación.
- [ ] Rechazo anterior a envío termina el caso; decisión conserva originales/diferencias y no permite merchant distinto.

**Verificación:** `npm run test -- --run tests/integration/authorization/decisions.test.ts`; probar revisión sin pago y términos obsoletos.

**Archivos previstos (4):** `src/modules/authorization/review.ts`, `src/modules/authorization/decisions.ts`, `src/modules/authorization/terms.ts`, `tests/integration/authorization/decisions.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T20: Reserva exclusiva del permiso

- [ ] Completada T20.

**Descripción:** Implementar la reserva transaccional y su exclusión por PO/factura lógicas.

**Dependencias:** T19.

**Criterios de aceptación:**

- [ ] Reserva y posterior creación de intención comparten transacción; dos reservas/decisiones concurrentes no habilitan dos envíos.
- [ ] UNKNOWN no libera permiso por timeout; COMPLETED consume autoridad y bloquea otro cargo.

**Verificación:** `npm run test -- --run tests/integration/authorization/reservation.test.ts`; concurrencia real en PostgreSQL.

**Archivos previstos (4):** `src/modules/authorization/reservation.ts`, `src/modules/authorization/grant-repository.ts`, `db/migrations/0007-grant-exclusion.sql`, `tests/integration/authorization/reservation.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T21: Permiso automático e invalidación

- [ ] Completada T21.

**Descripción:** Evaluar coincidencias bajo autoridad vigente y revocar permisos futuros al cambiar documentos/términos.

**Dependencias:** T20, T14.

**Criterios de aceptación:**

- [ ] MATCHED y quote exacto producen grant sin nuevo consentimiento; ausencia de autoridad, quote distinto o plan cambiado bloquean.
- [ ] Nuevas versiones/expiración/revocación impiden efectos futuros y preservan operaciones ya enviadas.

**Verificación:** `npm run test -- --run tests/unit/authorization/policy.test.ts tests/integration/authorization/invalidation.test.ts`.

**Archivos previstos (5):** `src/modules/authorization/policy.ts`, `src/modules/authorization/invalidation.ts`, `src/modules/authorization/service.ts`, `tests/unit/authorization/policy.test.ts`, `tests/integration/authorization/invalidation.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T21

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

## Fase: Evidencia AP2

### T22: Registro de claves de prueba

- [ ] Completada T22.

**Descripción:** Configurar las cuatro identidades ES256 y su registro público de confianza.

**Dependencias:** T08, T21.

**Criterios de aceptación:**

- [ ] Claves privadas persistentes se crean fuera de Git; registry asigna kid/rol y algoritmo permitido.
- [ ] Reiniciar conserva verificación; tokens no pueden suministrar hosts o claves confiables mediante jku/x5u.

**Verificación:** `npm run test -- --run tests/unit/ap2-evidence/trust.test.ts`; generar claves en directorio temporal de prueba.

**Archivos previstos (5):** `src/modules/ap2-evidence/trust.ts`, `src/modules/ap2-evidence/contracts.ts`, `scripts/create-demo-keys.ts`, `tests/unit/ap2-evidence/trust.test.ts`, `package.json`.

**Tamaño:** Mediano; una sesión enfocada.

### T23: Mandatos abiertos de consentimiento

- [ ] Completada T23.

**Descripción:** Emitir mandatos abiertos desde decisiones persistidas usando el perfil aprobado.

**Dependencias:** T22, T18, T19.

**Criterios de aceptación:**

- [ ] Checkout/payment abiertos usan vct, cnf y restricciones aprobadas; excepciones que cambian autoridad crean otra delegación.
- [ ] Emisión nunca acepta payload libre del navegador/LLM; claves de prueba están etiquetadas.

**Verificación:** `npm run test -- --run tests/integration/ap2-evidence/delegation.test.ts`; inspeccionar autoridad vinculada.

**Archivos previstos (4):** `db/migrations/0008-ap2-evidence.sql`, `src/modules/ap2-evidence/profile.ts`, `src/modules/ap2-evidence/issuer.ts`, `tests/integration/ap2-evidence/delegation.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T24: Vínculo de mandatos cerrados

- [ ] Completada T24.

**Descripción:** Firmar el checkout de prueba y cerrar la delegación sobre quote y grant concretos.

**Dependencias:** T23.

**Criterios de aceptación:**

- [ ] checkout_hash y transaction_id vinculan el mismo checkout_jwt; la extensión incluye DocumentRefs y términos.
- [ ] Serialización delegada y prueba de posesión respetan el borrador; quote renovado produce evidencia nueva.

**Verificación:** `npm run test -- --run tests/unit/ap2-evidence/binding.test.ts`; contrastar vectores independientes.

**Archivos previstos (4):** `src/modules/ap2-evidence/merchant-proxy.ts`, `src/modules/ap2-evidence/binder.ts`, `src/modules/ap2-evidence/delegated-sd-jwt.ts`, `tests/unit/ap2-evidence/binding.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T24

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

### T25: Verificador de ejecución AP2

- [ ] Completada T25.

**Descripción:** Verificar la cadena independientemente del emisor antes de efectos de pago.

**Dependencias:** T24, T20.

**Criterios de aceptación:**

- [ ] Firmas, restricciones, vínculos, hashes, audience/nonce, tiempos y roles se comprueban determinísticamente.
- [ ] Permiso AVAILABLE o RESERVED por la misma intención es válido según contexto; tampering/revocación/clave desconocida bloquean.

**Verificación:** `npm run test -- --run tests/unit/ap2-evidence/verification.test.ts tests/integration/ap2-evidence/execution.test.ts`.

**Archivos previstos (4):** `src/modules/ap2-evidence/verifier.ts`, `src/modules/ap2-evidence/execution-context.ts`, `tests/unit/ap2-evidence/verification.test.ts`, `tests/integration/ap2-evidence/execution.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T26: Recibos y export de evidencia

- [ ] Completada T26.

**Descripción:** Persistir recibos/observaciones y ofrecer evidencia inspeccionable con claves públicas.

**Dependencias:** T25, T15.

**Criterios de aceptación:**

- [ ] Export autenticado contiene bundles y claves públicas; resumen distingue identidad local, validez histórica y autoridad actual.
- [ ] Verificación no se presenta como pago; observación Reap no se atribuye como firma del proveedor.

**Verificación:** `npm run test -- --run tests/integration/ap2-evidence/export.test.ts`; inspeccionar export desde la consola.

**Archivos previstos (5):** `src/modules/ap2-evidence/receipts.ts`, `src/modules/ap2-evidence/service.ts`, `src/app/api/v1/evidence/[id]/[[...view]]/route.ts`, `src/app/cases/components/evidence-panel.tsx`, `tests/integration/ap2-evidence/export.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T26

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

## Fase: Reap

### T27: Cliente Reap validado

- [ ] Completada T27.

**Descripción:** Preparar transporte del proveedor, límites de host, validación y persistencia de claves/cuerpos.

**Dependencias:** T01, T25, T03.

**Criterios de aceptación:**

- [ ] Bearer/version solo en servidor; base sandbox y expiración se verifican, timeout y errores están tipados.
- [ ] Request/cuerpo/idempotencia se persisten antes de efectos; respuestas saneadas y dinero decimal exacto rechazan contradicciones.

**Verificación:** `npm run test -- --run tests/integration/reap-payments/client.test.ts`; simular 401/429/5xx y decimales.

**Archivos previstos (5):** `db/migrations/0009-reap.sql`, `src/modules/reap-payments/client.ts`, `src/modules/reap-payments/contracts.ts`, `src/modules/reap-payments/provider-requests.ts`, `tests/integration/reap-payments/client.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T28: Enrollment alojado de tarjeta existente

- [ ] Completada T28.

**Descripción:** Exponer el alta EXTERNAL y la consulta de readiness del instrumento.

**Dependencias:** T27, T10.

**Criterios de aceptación:**

- [ ] La tarjeta se introduce solo en Reap; servidor conserva enrollmentId y datos enmascarados del propietario correcto.
- [ ] Retorno no acredita ACTIVE; solo consulta del proveedor habilita instrumento y nextAction se valida.

**Verificación:** `npm run test:e2e -- tests/e2e/enrollment.spec.ts`; usar proveedor simulado sin PAN real.

**Archivos previstos (4):** `src/modules/reap-payments/enrollment.ts`, `src/app/api/v1/enrollments/[[...path]]/route.ts`, `src/app/cases/components/enrollment-panel.tsx`, `tests/e2e/enrollment.spec.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T29: Plan validado de productos Acteck

- [ ] Completada T29.

**Descripción:** Resolver variantes y persistir la compra seleccionable antes de consentir PO.

**Dependencias:** T28, T15.

**Criterios de aceptación:**

- [ ] SKU y variantId no se confunden; solo productos de Acteck y hasta 20 variantes forman un plan válido.
- [ ] Plan vincula PO, cantidades y envío; hash cambia al modificar términos que requieren nueva autoridad.

**Verificación:** `npm run test -- --run tests/integration/reap-payments/plans.test.ts`; selección manual de variantes simuladas.

**Archivos previstos (5):** `src/modules/reap-payments/products.ts`, `src/modules/reap-payments/plans.ts`, `src/app/api/v1/purchase-plans/route.ts`, `src/app/cases/components/purchase-plan-panel.tsx`, `tests/integration/reap-payments/plans.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T29

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

### T30: Cotización vigente con envío

- [ ] Completada T30.

**Descripción:** Obtener total completo y snapshot concreto para autorización/evidencia.

**Dependencias:** T29.

**Criterios de aceptación:**

- [ ] Quote usa items y dirección configurada; seleccionar envío revalida total/expiry/termsHash.
- [ ] Precio procede del proveedor y se conserva exacto; expired o QUOTE_REPLACEMENT_REQUIRED requiere otro quote.

**Verificación:** `npm run test -- --run tests/integration/reap-payments/quotes.test.ts`; simular cambio de envío y renovación.

**Archivos previstos (4):** `src/modules/reap-payments/quotes.ts`, `src/app/api/v1/quotes/[[...path]]/route.ts`, `src/app/cases/components/quote-panel.tsx`, `tests/integration/reap-payments/quotes.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T31: Envío exclusivo de checkout

- [ ] Completada T31.

**Descripción:** Crear una intención y enviar exactamente la compra que tiene autoridad/evidencia vigentes.

**Dependencias:** T30, T20, T25.

**Criterios de aceptación:**

- [ ] Releer quote/enrollment, validar evidence/grant y reservar junto con intención en una transacción.
- [ ] Persistir clave/cuerpo antes de red; dos workers o un doble clic no crean dos checkouts ni otro importe.

**Verificación:** `npm run test -- --run tests/integration/reap-payments/execute.test.ts`; comprobar concurrencia y precondiciones fallidas.

**Archivos previstos (4):** `db/migrations/0010-payment-intents.sql`, `src/modules/reap-payments/execute.ts`, `src/modules/reap-payments/intent-repository.ts`, `tests/integration/reap-payments/execute.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T31

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

### T32: Estado confirmado y discrepancia posterior

- [ ] Completada T32.

**Descripción:** Consultar lifecycle y conservar pedido, importe y observación de evidencia.

**Dependencias:** T31, T26.

**Criterios de aceptación:**

- [ ] nextAction/PROCESSING permanecen pendientes; solo GET confirmado marca COMPLETED con orderId/finalAmount.
- [ ] Importe final distinto registra alerta, consume/excluye nuevo cargo y no altera el importe autorizado histórico.

**Verificación:** `npm run test -- --run tests/integration/reap-payments/status.test.ts`; respuestas tardías no revierten COMPLETED.

**Archivos previstos (4):** `src/modules/reap-payments/status.ts`, `src/modules/reap-payments/service.ts`, `src/app/api/v1/payments/[id]/route.ts`, `tests/integration/reap-payments/status.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T33: Recuperación de intención incierta

- [ ] Completada T33.

**Descripción:** Recuperar después de timeout/crash respetando la ventana del proveedor y la exclusión local.

**Dependencias:** T32.

**Criterios de aceptación:**

- [ ] Misma clave/cuerpo dentro de 24 h; con ID se consulta; fuera de ventana no se crea un intento alternativo incierto.
- [ ] Backoff/Retry-After y agotamiento dejan UNKNOWN; solo fallo terminal verificado sin cargo permite otro intento controlado.

**Verificación:** `npm run test -- --run tests/integration/reap-payments/recovery.test.ts`; reinicio y reloj más allá de 24 horas.

**Archivos previstos (4):** `src/modules/reap-payments/recovery.ts`, `src/modules/reap-payments/retry-policy.ts`, `src/app/api/v1/payments/[id]/refresh/route.ts`, `tests/integration/reap-payments/recovery.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T33

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

## Fase: Operación y agente

### T34: Outbox y jobs persistentes

- [ ] Completada T34.

**Descripción:** Conectar eventos de documentos/decisiones con trabajos durables sin perder consistencia.

**Dependencias:** T33, T15.

**Criterios de aceptación:**

- [ ] Cambio de estado y evento/outbox se escriben juntos; duplicar evento no duplica trabajo lógico.
- [ ] Jobs conservan expectedVersion, runAt, intentos y lease; consumen los eventos de versiones ya persistidos.

**Verificación:** `npm run test -- --run tests/integration/payment-workflow/jobs.test.ts`; rollback y duplicación de evento.

**Archivos previstos (4):** `db/migrations/0011-workflow-jobs.sql`, `src/modules/payment-workflow/jobs.ts`, `src/modules/payment-workflow/outbox.ts`, `tests/integration/payment-workflow/jobs.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T35: Worker recuperable

- [ ] Completada T35.

**Descripción:** Ejecutar jobs al menos una vez, sin bloquear transacciones durante llamadas externas.

**Dependencias:** T34.

**Criterios de aceptación:**

- [ ] Workers reclaman con SKIP LOCKED y lease; caída permite retomar sin duplicar intención de pago.
- [ ] Reintentos/backoff y errores persisten; cierre del proceso libera recursos y no presenta trabajos inciertos como fallidos terminales.

**Verificación:** `npm run test -- --run tests/integration/payment-workflow/worker.test.ts`; `npm run worker` y reinicio controlado.

**Archivos previstos (4):** `src/workers/runner.ts`, `src/modules/payment-workflow/job-handlers.ts`, `tests/integration/payment-workflow/worker.test.ts`, `package.json`.

**Tamaño:** Mediano; una sesión enfocada.

### T36: Coordinador de casos

- [ ] Completada T36.

**Descripción:** Integrar los servicios aprobados y reconstruir el estado/acciones del caso desde registros persistidos.

**Dependencias:** T35, T21, T26, T33.

**Criterios de aceptación:**

- [ ] El coordinador transmite quote snapshots a autorización/evidencia sin imports inversos ni reglas duplicadas.
- [ ] Coincidencia autorizada avanza; discrepancia, configuración faltante y versiones nuevas esperan la acción correcta.

**Verificación:** `npm run test -- --run tests/integration/payment-workflow/orchestration.test.ts`; probar factura anterior a aprobación.

**Archivos previstos (4):** `src/modules/payment-workflow/coordinator.ts`, `src/modules/payment-workflow/state.ts`, `src/modules/payment-workflow/actions.ts`, `tests/integration/payment-workflow/orchestration.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T36

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

### T37: Consentimiento de PO desde la consola

- [ ] Completada T37.

**Descripción:** Conectar plan/instrumento reales con el permiso humano y la automatización de coincidencias.

**Dependencias:** T36, T29, T28.

**Criterios de aceptación:**

- [ ] Mostrar términos y plazo antes de autorizar; resolver actor, plan y versiones en servidor.
- [ ] PO aprobada y factura coincidente encolan pago sin segundo clic de negocio; cambios de plan/instrumento exigen nuevo consentimiento.

**Verificación:** `npm run test:e2e -- tests/e2e/po-approval.spec.ts`; revisar consentimiento y ausencia de aprobación automática por agente.

**Archivos previstos (5):** `src/app/api/v1/po-authorizations/[[...path]]/route.ts`, `src/app/api/v1/payment-grants/[id]/route.ts`, `src/app/cases/components/po-approval-panel.tsx`, `src/app/cases/[[...path]]/page.tsx`, `tests/e2e/po-approval.spec.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T38: Revisión y excepción desde la consola

- [ ] Completada T38.

**Descripción:** Completar los botones confirmados y sus condiciones de disponibilidad.

**Dependencias:** T37, T19.

**Criterios de aceptación:**

- [ ] Facturas revisadas solo registra revisión; Autorizar Pago exige justificación/términos vigentes y conserva MISMATCHED.
- [ ] Rechazo antes de reserva impide checkout; después de reserva devuelve conflicto y muestra estado real.

**Verificación:** `npm run test:e2e -- tests/e2e/exception.spec.ts`; excepción, quote cambiado y rechazo concurrente.

**Archivos previstos (4):** `src/app/api/v1/payment-reviews/route.ts`, `src/app/api/v1/payment-decisions/route.ts`, `src/app/cases/components/payment-review-panel.tsx`, `tests/e2e/exception.spec.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T39: Retorno Reap y seguimiento visible

- [ ] Completada T39.

**Descripción:** Presentar la aprobación alojada y el seguimiento sin confiar en parámetros del navegador.

**Dependencias:** T38, T32, T35.

**Criterios de aceptación:**

- [ ] Nonce persistido correlaciona sesión/operación; retorno falsificado no confirma pago y expiración de sesión conduce a login.
- [ ] UI muestra polling/refresh, pendientes, UNKNOWN, rechazo/fallo y COMPLETED sandbox con importe/pedido o alerta.

**Verificación:** `npm run test:e2e -- tests/e2e/payment-status.spec.ts`; callback inválido, sesión caducada y estados terminales.

**Archivos previstos (5):** `src/shared/provider-return.ts`, `src/app/payments/return/page.tsx`, `src/app/cases/components/payment-status-panel.tsx`, `src/app/cases/[[...path]]/page.tsx`, `tests/e2e/payment-status.spec.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T39

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

### T40: Herramientas del agente con guardas

- [ ] Completada T40.

**Descripción:** Exponer las herramientas permitidas con schemas estrictos y validación de estado independiente.

**Dependencias:** T36.

**Criterios de aceptación:**

- [ ] Schemas no admiten propiedades extra; cada tool comprueba caso/versión/permiso y devuelve resultado tipado saneado.
- [ ] No existen herramientas de consentimiento, SQL/shell, firma libre ni navegación de checkout; prompt injection no elude controles.

**Verificación:** `npm run test -- --run tests/integration/payment-workflow/tools.test.ts`; invocaciones hostiles y actor falso.

**Archivos previstos (5):** `db/migrations/0012-agent-audit.sql`, `src/modules/payment-workflow/tool-schemas.ts`, `src/modules/payment-workflow/tools.ts`, `src/modules/payment-workflow/tool-policy.ts`, `tests/integration/payment-workflow/tools.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### T41: Responses y reanudación del agente

- [ ] Completada T41.

**Descripción:** Coordinar herramientas mediante el modelo configurado y registrar ejecución real recuperable.

**Dependencias:** T40, T35, T39.

**Criterios de aceptación:**

- [ ] Usar function_call/output por call_id, strict y parallel_tool_calls false; limitar diez calls/60 s y persistir progreso.
- [ ] Fallos de OpenAI permiten reanudar; historial saneado y explicación corresponden al estado del servidor, sin documentos/secretos completos.

**Verificación:** `npm run test -- --run tests/integration/payment-workflow/agent.test.ts`; probar límite y error con doble del modelo.

**Archivos previstos (5):** `src/modules/payment-workflow/agent.ts`, `src/modules/payment-workflow/agent-repository.ts`, `src/app/api/v1/cases/[id]/events/route.ts`, `src/app/api/v1/cases/[id]/resume/route.ts`, `tests/integration/payment-workflow/agent.test.ts`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T41

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

## Fase: Verificación de entrega

### T42: Accesibilidad y adaptación de la consola

- [ ] Completada T42.

**Descripción:** Verificar los recorridos completos por teclado y distintos tamaños de pantalla.

**Dependencias:** T41.

**Criterios de aceptación:**

- [ ] 360/768/1440 px no provocan scroll horizontal de página; labels, errores, foco y estados cumplen los criterios de la spec.
- [ ] Loading/doble clic, aria-live y estado sin dependencia del color funcionan; no se muestra contenido como HTML activo.

**Verificación:** `npm run test:e2e -- tests/e2e/accessibility.spec.ts`; revisión manual de teclado, contraste y foco.

**Archivos previstos (5):** `src/app/globals.css`, `src/app/cases/components/payment-review-panel.tsx`, `src/app/cases/components/payment-status-panel.tsx`, `tests/e2e/accessibility.spec.ts`, `docs/verification/accessibility.md`.

**Tamaño:** Mediano; una sesión enfocada.

### T43: Recorridos de recuperación completos

- [ ] Completada T43.

**Descripción:** Cerrar la cobertura de aceptación con aplicación, DB y proveedores simulados integrados.

**Dependencias:** T42, T33.

**Criterios de aceptación:**

- [ ] Coincidencia, excepción y rechazo cumplen sus criterios; refresh/reinicio/doble evento conservan un único pago activo/completado.
- [ ] Reporte relaciona cada escenario de las seis specs con una verificación; los tests normales no llaman a proveedores reales.

**Verificación:** `npm run test -- --run`; `npm run test:e2e`; `npm run typecheck`; `npm run lint`; `npm run build`.

**Archivos previstos (4):** `tests/e2e/workflow.spec.ts`, `tests/integration/payment-workflow/restart.test.ts`, `tests/fixtures/reap/scenarios.ts`, `docs/verification/acceptance.md`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T43

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.

### T44: Recorrido real de sandbox

- [ ] Completada T44.

**Descripción:** Demostrar el flujo con Acteck y el sandbox del equipo, incluyendo ejecución real de herramientas del agente.

**Dependencias:** T43, T01.

**Criterios de aceptación:**

- [ ] Config vigente, ACTIVE y Acteck disponibles; completar consentimiento, evidencia y checkout sandbox y confirmar orderId/finalAmount por GET.
- [ ] El test opt-in muestra sandbox y usa simulación del proveedor si está habilitada; nunca publica secretos ni disfraza un mock como integración.

**Verificación:** `npm run test:sandbox -- --run tests/sandbox/reap-payments`; recorrido manual de agente y export público de evidencia de prueba saneada.

**Archivos previstos (3):** `tests/sandbox/reap-payments.test.ts`, `docs/verification/sandbox.md`, `package.json`.

**Tamaño:** Mediano; una sesión enfocada.

### T45: Guía de ejecución y revisión final

- [ ] Completada T45.

**Descripción:** Entregar instrucciones reproducibles y confirmar que docs reflejan lo implementado.

**Dependencias:** T44.

**Criterios de aceptación:**

- [ ] README explica instalación, migraciones/seed, web/worker, configuración y flujos, con comandos realmente comprobados.
- [ ] Specs/ADR/plan reflejan resultado y limitaciones; no se publica ni despliega automáticamente.

**Verificación:** Reproducir quick start con datos sintéticos y revisar el diff con code-review-and-quality; aplicar Definition of Done.

**Archivos previstos (4):** `README.md`, `docs/runbook.md`, `tasks/plan.md`, `tasks/todo.md`.

**Tamaño:** Mediano; una sesión enfocada.

### Checkpoint después de T45

- [ ] Verificaciones de las tareas desde el checkpoint anterior satisfechas y evidencia registrada.
- [ ] Scripts disponibles pasan; se verifica el recorrido nuevo por HTTP/navegador cuando corresponde.
- [ ] Fallos concretos resueltos y documentación coherente; ninguna tarea incierta se marca como terminada.
