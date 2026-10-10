# Convenciones de las specs de PoPayments

Estado: aprobado por el usuario el 2026-10-09, junto con las seis specs. Estos documentos especifican la aplicación futura: los comandos y directorios previstos no existen aún. La planificación se recoge en [plan](tasks/plan.md) y [tareas](tasks/todo.md).

## Decisiones y supuestos

- Aplicación web en español, una empresa y una cuenta de aprobador para la demo. No hay ERP, OCR, pagos reales ni compras a otro merchant.
- Se conserva la PO y factura originales. La coincidencia considera únicamente referencia de PO, proveedor, moneda y total. Las excepciones justificadas pueden autorizar condiciones diferentes sin editar originales.
- JSON y XML propio de la demo, confirmados por el usuario. No se presupone CFDI.
- El equipo dispone de una tarjeta de prueba ya preparada. Se propone enrolarla como `EXTERNAL` mediante la superficie alojada por Reap. No se requiere Cards Issuing en esta entrega. Véase [pagos](SPEC-reap-payments.md).
- El caso representa la autorización de una compra antes del checkout. La factura de ejemplo es el documento de cobro de la demo; el resultado será un nuevo pedido de merchant, no la liquidación de una deuda previa en un ERP.
- Una PO admite una factura vigente y un solo pago completado. Pagos parciales, múltiples facturas por PO, devoluciones y conversión de monedas quedan fuera de la demo.

## Stack propuesto

Monolito modular con Next.js App Router y Route Handlers sobre Node.js; React para la consola y un worker Node separado del proceso HTTP para trabajos persistentes. PostgreSQL almacena documentos, decisiones, evidencia, jobs e intenciones de pago. Acceso SQL parametrizado con `pg`, migraciones SQL y transacciones; no se necesita Redis ni un broker externo.

La demo se ejecuta en un sandbox Docker: `compose.yaml` levanta PostgreSQL 17, migra esquema y después inicia web y worker. La imagen de la aplicación se construye con `Dockerfile`; datos de PostgreSQL persisten en un volumen. El usuario añadió este requisito durante la implementación. El sandbox debe proporcionar una URL HTTPS pública para los retornos alojados de Reap.

| Componente | Versión propuesta | Motivo |
|---|---|---|
| Node.js | 22.23.2 | Coincide con el runtime disponible en este proyecto. |
| Next.js / React | 16.4.0 / 19.3.0 | Consola y API en el mismo repositorio. |
| TypeScript | 7.0.2, `strict: true` | Contratos y estados discriminados. |
| PostgreSQL / pg | PostgreSQL 17 / pg 8.23.1 | Persistencia y exclusión atómica de operaciones duplicadas. |
| Zod / fast-xml-parser | 4.6.5 / 5.11.2 | Validación común tras leer JSON o XML. |
| jose / @sd-jwt/core | 6.2.12 / 0.22.0, candidato fijado en el plan | Firmas con biblioteca criptográfica y serialización SD-JWT. Compatibilidad de delegación por verificar. |
| OpenAI SDK | 7.32.0 | Responses API con llamadas a herramientas; modelo seleccionado mediante configuración del equipo. |
| Vitest / Playwright | 5.0.3 / 1.64.0 | Pruebas de dominio, contratos y flujos de navegador. |

Las versiones de paquetes se consultaron en el registro npm al redactar la propuesta. Deben instalarse con versiones exactas y lockfile durante la implementación, después de comprobar compatibilidad. No se han instalado ni probado en este repositorio. `OPENAI_MODEL` es obligatorio: debe ser un modelo accesible a la cuenta del equipo con Responses y function calling. No se presume que la llave Reap sirva para OpenAI.

## Comandos y estructura propuestos

La implementación deberá crear estos scripts; hoy no son ejecutables en este repositorio:

```bash
npm ci
docker compose up -d db
npm run db:migrate
npm run db:seed:demo
npm run dev
npm run worker
npm run typecheck
npm run lint
npm run build
npm run test -- --run
npm run test:e2e
docker compose up --build -d
```

`db:seed:demo` crea únicamente el aprobador y datos sintéticos. No enrola tarjetas ni ejecuta checkouts. Las pruebas predeterminadas utilizan dobles de los proveedores. `npm run test:sandbox -- --run` será un comando separado, opt-in, para el flujo real de sandbox.

```text
src/app/                     consola y Route Handlers HTTP
src/modules/<module-id>/     contratos, dominio, servicios y repositorios
src/shared/                  dinero, errores, sesión, reloj, SQL y serialización
src/workers/                 runner de jobs del payment-workflow
db/migrations/               migraciones SQL versionadas
tests/unit/<module-id>/      reglas puras y verificación
tests/integration/           contratos HTTP, persistencia y proveedores simulados
tests/e2e/                   recorridos Playwright
tests/fixtures/              documentos sintéticos JSON/XML y vectores de firmas
docs/decisions/              decisiones y su razonamiento
```

## Convenciones de contratos

- IDs internos: UUID; fechas: ISO 8601 UTC; estados: `UPPER_SNAKE_CASE`; propiedades JSON: `camelCase`. Tiempos límite usan un reloj inyectable.
- Dinero interno: `{ currency: "MXN" | "USD", minorUnits: string }`, entero positivo decimal en texto. Ambas monedas usan dos decimales. Comparaciones y aritmética con enteros; no sumar ni comparar importes usando coma flotante. El adaptador Reap realiza una conversión explícita a unidades mayores.
- Hashes de evidencia: SHA-256 codificado base64url sin padding. La serialización canónica de objetos normalizados ordena recursivamente las claves, conserva el orden de arrays y produce JSON UTF-8 sin espacios. No se presenta como implementación certificada de JCS.
- APIs internas bajo `/api/v1`. Éxito: `{ data, requestId }`; listas añaden `{ pagination: { page, pageSize, totalItems } }`. `pageSize` por defecto 20, máximo 100.
- Error: `{ error: { code, message, details }, requestId }`. HTTP 400 para sintaxis, 401/403 para acceso, 404 para recursos, 409 para concurrencia/estado, 413 para tamaño, 422 para datos semánticos y 502/503 para dependencias. `details` contiene campos y razones, sin secretos.
- Mutaciones aceptan `Idempotency-Key` y guardan clave, hash de petición y resultado con una restricción única por actor y operación. Misma clave y contenido: repetir resultado; contenido distinto: 422; operación en curso: 409. Retención local durante toda la demo, sin TTL de 24 h. La protección de negocio contra doble pago persiste además de esta clave HTTP.
- Cada decisión se registra con `actorId` obtenido de la sesión, fecha, entidad, versión, términos y motivo. El cliente no elige quién autorizó. Auditoría append-only a nivel aplicación; no se afirma inmutabilidad frente a un administrador de base de datos.

## Acceso, configuración y límites comunes

Una cuenta de aprobador con contraseña almacenada mediante scrypt y sesiones opacas persistidas, de ocho horas. Cookies HttpOnly, SameSite=Lax y Secure con HTTPS. Las mutaciones verifican sesión, Origin y token CSRF; el retorno desde Reap no ejecuta una autorización por sí mismo. Una demo publicada necesita HTTPS y PostgreSQL persistente. No se publican rutas de reset de datos.

La configuración secreta va en variables de entorno. El futuro `.env.example` contiene nombres y valores ficticios: `DATABASE_URL`, `APP_BASE_URL`, `DEMO_PASSWORD_HASH`, `SESSION_SECRET`, `REAP_API_KEY`, `REAP_BASE_URL`, `REAP_VERSION`, `REAP_KEY_EXPIRES_AT`, `OPENAI_API_KEY`, `OPENAI_MODEL`, claves AP2 y configuración de identidad del sandbox. Las claves privadas AP2 sobreviven a reinicios y no van en Git. La fecha comunicada para la expiración de Reap es `2026-10-11T00:00:00-06:00`; no se confunde con la caducidad de la tarjeta o del enrollment.

Siempre: validar entradas y respuestas de proveedores, usar SQL parametrizado, preservar originales, comprobar autorización antes de efectos, registrar estados reales y probar los escenarios de aceptación. Consultar cambios al alcance aprobado, nuevas monedas/merchants, contratos incompatibles o uso de producción. Nunca: escribir credenciales o PAN/CVV/OTP en archivos versionados, darlos al LLM, aceptar aprobaciones del agente como decisiones humanas o simular un éxito real de Reap.

## Verificación y revisión

Cada escenario de aceptación de las seis specs tendrá una prueba automatizada apropiada. Se cubrirán todos los resultados de la decisión de autorización, fallos de firma y transiciones de pago con efectos; no se propone un porcentaje global de cobertura como sustituto de esos escenarios. Las pruebas unitarias/integración predeterminadas no hacen peticiones pagadas o mutantes a proveedores.

La revisión debe validar primero las decisiones de producto confirmadas, luego los supuestos técnicos propuestos y, por último, la configuración externa disponible. El éxito de tests con proveedores simulados no prueba la disponibilidad de Acteck ni el funcionamiento del checkout en sandbox.

## Fuentes técnicas

- [Next.js: instalación](https://nextjs.org/docs/app/getting-started/installation) y [Node.js: versiones](https://nodejs.org/en/about/previous-releases).
- Registro npm oficial: [Next.js](https://registry.npmjs.org/next/latest), [TypeScript](https://registry.npmjs.org/typescript/latest), [Vitest](https://registry.npmjs.org/vitest/latest); las demás versiones se consultaron en el mismo registro.
- [PostgreSQL: transacciones](https://www.postgresql.org/docs/17/tutorial-transactions.html).
- [RFC 9901](https://datatracker.ietf.org/doc/rfc9901/) y [biblioteca SD-JWT](https://sdjwt.js.org/).
- [OpenAI: function calling](https://developers.openai.com/api/docs/guides/function-calling).
