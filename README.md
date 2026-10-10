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

`db:seed:demo` prepara el aprobador y diez órdenes ficticias, de `PO-DEMO-001` a `PO-DEMO-010`, con proveedor Acteck, partidas e importes en MXN. Cada PO queda vinculada a un caso pendiente de factura. Los datos están en [fixtures/demo-purchase-orders.json](fixtures/demo-purchase-orders.json). Puedes repetir el comando: conserva las PO ya vinculadas sin duplicar casos ni reiniciar su estado.

Abre `http://localhost:3000/login` con el correo y la contraseña elegidos. Compose publica la web en `127.0.0.1:3000`; `APP_BIND_ADDRESS` y `APP_PORT` permiten configurar la dirección y el puerto del host. El volumen `postgres_data` conserva documentos y decisiones al reiniciar. `docker compose down` detiene los servicios; `docker compose down -v` borra la base de datos. Las migraciones se aplican antes de iniciar web y worker.

### Si esta sesión no tiene acceso al socket Docker

Si `getent group docker` incluye a tu usuario pero `id -nG` no muestra `docker`, el proceso conserva los grupos de una sesión anterior. En este equipo se comprobó que ejecutar el comando como el mismo usuario con `sudo` carga sus grupos actuales:

```bash
sudo -u seb docker info
sudo -u seb docker compose up --build -d
sudo -u seb docker compose ps
```

También puedes abrir una shell con los grupos actualizados mediante `sudo -u seb -H bash` y usar allí `docker` sin prefijo. Una terminal creada desde un proceso que conserva los grupos antiguos hereda esos mismos grupos. Para actualizar toda la sesión, cierra la sesión de escritorio o SSH y vuelve a entrar, como indica la [guía de Docker](https://docs.docker.com/engine/install/linux-postinstall/). El socket permanece `root:docker` con permisos `660`.

Reap requiere `APP_BASE_URL` público con HTTPS para sus retornos alojados, además de `REAP_API_KEY`, `REAP_OWNER_ID`, `REAP_OWNER_EMAIL`, `REAP_ACTECK_WEBSITE` verificado por el equipo y `REAP_SHIPPING_ADDRESS_JSON`. Esta última variable contiene un objeto JSON con `firstName`, `lastName`, `phone` internacional, `addressLine1`, `city` y `country` de dos letras. La llave de equipo recibida caduca el 11 de octubre de 2026 a las 00:00 hora de Ciudad de México; después se necesita una nueva. La tarjeta existente se introduce solamente en la página alojada por Reap. `.env` está excluido de Git.

El servicio `keys` crea cuatro claves ES256 de prueba en el volumen `ap2_keys` antes de iniciar web y worker. El volumen conserva la capacidad de verificar evidencia tras reinicios. No borres este volumen si necesitas auditar mandatos anteriores.

## Comprobaciones

### Tarjeta predeterminada

Configura en `.env` los campos `REAP_DEFAULT_CARD_LAST4`, `REAP_DEFAULT_CARD_EXPIRY_MONTH` y `REAP_DEFAULT_CARD_EXPIRY_YEAR` (año de cuatro dígitos), además de la llave `REAP_API_KEY`. Reinicia web y worker con `docker compose up -d`. La tarjeta se muestra enmascarada y pendiente de activación. No guardes PAN, CVV ni OTP en este archivo: se introducen únicamente en el formulario alojado por Reap.

Para activarla, configura `REAP_OWNER_ID`, `REAP_OWNER_EMAIL` y una `APP_BASE_URL` pública HTTPS, inicia el registro desde la lista de casos y complétalo en Reap. Solo un enrollment `ACTIVE` del propietario, con los últimos cuatro dígitos y vencimiento coincidentes, puede autorizar nuevas PO. `GET /api/v1/payment-method` devuelve esta selección a usuarios autenticados. Si no hay preferencia configurada, se selecciona una tarjeta activa con metadatos confirmados por Reap.

Si Reap aloja el registro en un dominio adicional, configura `REAP_REDIRECT_ORIGINS` con los orígenes HTTPS exactos confirmados por la API, separados por comas y sin rutas ni barra final. El sandbox del equipo devolvió `https://sandbox.collect.prava.space`; se configuró localmente ese origen. No se admiten comodines, subdominios adicionales ni URLs con usuario/contraseña. Un enlace rechazado devuelve `REAP_REDIRECT_NOT_ALLOWED` sin revelar el token. Tras cambiar código y configuración, ejecuta `docker compose up --build -d --wait`, recarga Casos y usa «Reintentar misma solicitud» si el registro quedó `UNKNOWN`: conserva la clave de idempotencia original.

### Validación local

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm run test -- --run
```

Para comprobar el recorrido web con un usuario ya sembrado, inicia `npm run start` y configura `E2E_EMAIL`, `E2E_PASSWORD` y, si usas un Chromium del sistema, `PLAYWRIGHT_CHROMIUM_PATH` antes de `npm run test:e2e`. La comprobación de un enrollment Reap existente es opt-in: `RUN_SANDBOX_TESTS=1 REAP_TEST_ENROLLMENT_ID=... npm run test:sandbox`, con la llave en el entorno. Esa prueba consulta un recurso; no crea enrollment ni checkout.

Las pruebas de integración PostgreSQL se ejecutan si se configura `DATABASE_URL`; sin ella Vitest las omite. Se comprobaron el build de producción y 27 pruebas con PostgreSQL local. El sandbox Docker también se construyó y arrancó: web y base saludables, worker activo, recorrido en Chromium aprobado y persistencia verificada tras recrear los contenedores. Consulta la [evidencia de Docker](docs/verification/docker.md). La integración real con Reap sigue pendiente de configuración externa.

## Especificación

- [Contexto](context.md), [mapa de capacidades](CAPABILITY-MAP.md) y [convenciones](SPEC-CONVENTIONS.md).
- [Plan](tasks/plan.md), [tareas](tasks/todo.md) y [diagnóstico de dependencias externas](docs/readiness.md).
- Las skills de Addy Osmani están instaladas solo en `.agents/skills/` de este proyecto.
