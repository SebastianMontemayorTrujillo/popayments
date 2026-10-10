# PoPayments

Demo de Cuentas por Pagar para compras a Acteck. Los documentos JSON o XML propio se guardan por versión; el servidor concilia proveedor, referencia de PO, moneda e importe y registra decisiones humanas. La consola prepara planes, cotizaciones y evidencia AP2 de prueba antes de enviar un checkout Agentic a Reap sandbox. Un agente OpenAI opcional coordina herramientas bajo las autorizaciones del servidor.

## Ejecutar en un sandbox Docker

Requisitos: Docker Engine con Compose v2 y un puerto local disponible (3000 por defecto). Desde la raíz del repositorio:

```bash
cp .env.example .env
```

En `.env`, cambia `POSTGRES_PASSWORD` en ambas apariciones, establece `SESSION_SECRET` con al menos 32 caracteres aleatorios y configura `DEMO_EMAIL`. Puedes generar el secreto con `openssl rand -hex 32`. La contraseña se guarda como hash. Prepara la imagen y genera el hash sin dejar la contraseña en el historial:

```bash
docker compose build
read -rsp 'Contraseña de demo: ' demo_password; echo
printf '%s' "$demo_password" | docker compose run --rm --no-deps -T web npm run password:hash
unset demo_password
```

Copia la línea `scrypt:...` resultante a `DEMO_PASSWORD_HASH` en `.env`. Después:

```bash
docker compose up -d
docker compose exec web npm run db:seed:demo
curl -fsS http://localhost:3000/api/health
```

Abre `http://localhost:3000/login` con el correo y la contraseña elegidos. El volumen `postgres_data` conserva documentos y decisiones al reiniciar. `docker compose down` detiene los servicios; `docker compose down -v` borra la base de datos. Las migraciones se aplican antes de iniciar web y worker.

Reap requiere `APP_BASE_URL` público con HTTPS para sus retornos alojados, además de `REAP_API_KEY`, `REAP_OWNER_ID`, `REAP_OWNER_EMAIL`, `REAP_ACTECK_WEBSITE` verificado por el equipo y `REAP_SHIPPING_ADDRESS_JSON`. Esta última variable contiene un objeto JSON con `firstName`, `lastName`, `phone` internacional, `addressLine1`, `city` y `country` de dos letras. La llave de equipo recibida caduca el 11 de octubre de 2026 a las 00:00 hora de Ciudad de México; después se necesita una nueva. La tarjeta existente se introduce solamente en la página alojada por Reap. `.env` está excluido de Git.

El servicio `keys` crea cuatro claves ES256 de prueba en el volumen `ap2_keys` antes de iniciar web y worker. El volumen conserva la capacidad de verificar evidencia tras reinicios. No borres este volumen si necesitas auditar mandatos anteriores.

## Comprobaciones

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm run test -- --run
```

Para comprobar el recorrido web con un usuario ya sembrado, inicia `npm run start` y configura `E2E_EMAIL`, `E2E_PASSWORD` y, si usas un Chromium del sistema, `PLAYWRIGHT_CHROMIUM_PATH` antes de `npm run test:e2e`. La comprobación de un enrollment Reap existente es opt-in: `RUN_SANDBOX_TESTS=1 REAP_TEST_ENROLLMENT_ID=... npm run test:sandbox`, con la llave en el entorno. Esa prueba consulta un recurso; no crea enrollment ni checkout.

Las pruebas de integración PostgreSQL se ejecutan si se configura `DATABASE_URL`; sin ella Vitest las omite. En este entorno se comprobaron el build de producción, el endpoint de salud, login y la suite con PostgreSQL local. Docker y Compose están instalados, pero esta sesión aún no heredó la membresía del grupo `docker`; Compose se validó estáticamente y el arranque real de contenedores queda por comprobar tras renovar la sesión.

## Especificación

- [Contexto](context.md), [mapa de capacidades](CAPABILITY-MAP.md) y [convenciones](SPEC-CONVENTIONS.md).
- [Plan](tasks/plan.md), [tareas](tasks/todo.md) y [diagnóstico de dependencias externas](docs/readiness.md).
- Las skills de Addy Osmani están instaladas solo en `.agents/skills/` de este proyecto.
