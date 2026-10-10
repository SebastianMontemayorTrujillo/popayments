# PoPayments

Demo de Cuentas por Pagar para compras a Acteck. Los documentos JSON o XML propio se guardan por versión; el servidor concilia proveedor, referencia de PO, moneda e importe y registra decisiones humanas. El recorrido completo de pago y evidencia AP2 sigue en implementación.

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

Reap requiere `APP_BASE_URL` público con HTTPS para sus retornos alojados, además de `REAP_API_KEY`, owner ID y correo válidos. La llave de equipo recibida caduca el 11 de octubre de 2026 a las 00:00 hora de Ciudad de México; después se necesita una nueva. La tarjeta existente se introduce solamente en la página alojada por Reap. `.env` está excluido de Git.

## Comprobaciones

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm run test -- --run
```

Las pruebas de integración PostgreSQL se ejecutan si se configura `DATABASE_URL`; sin ella Vitest las omite. En este entorno se comprobó el build de producción, el endpoint de salud, login y la suite con PostgreSQL local. Aquí no hay daemon Docker; Compose se validó estáticamente y el arranque real de contenedores debe comprobarse en el host del sandbox.

## Especificación

- [Contexto](context.md), [mapa de capacidades](CAPABILITY-MAP.md) y [convenciones](SPEC-CONVENTIONS.md).
- [Plan](tasks/plan.md), [tareas](tasks/todo.md) y [diagnóstico de dependencias externas](docs/readiness.md).
- Las skills de Addy Osmani están instaladas solo en `.agents/skills/` de este proyecto.
