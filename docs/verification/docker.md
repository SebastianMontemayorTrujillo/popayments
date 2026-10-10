# Verificación del sandbox Docker

Comprobado el 9 de octubre de 2026, hora de Monterrey.

## Problemas resueltos

1. `seb` estaba registrado en el grupo `docker`, pero el proceso de Codex y el gestor de sesión conservaban grupos anteriores. Una shell hija ordinaria heredaba esos grupos. `sudo -n -u seb` carga los grupos actuales del mismo usuario: `docker info` y `docker run --rm hello-world` funcionaron. El socket conserva propietario `root:docker` y modo `660`.
2. Compose heredaba `build: .` en cuatro servicios que exportaban la etiqueta `popayments:local` simultáneamente. El build fallaba con `image ... already exists`. Ahora solo `web` define `build`; los demás servicios reutilizan la imagen local. `docker compose build --print` confirma un único objetivo.

## Resultados observados

- Docker Engine 29.1.3 y Compose 2.40.3.
- `sudo -u seb docker compose up --build -d` finalizó correctamente.
- Build Next.js y TypeScript dentro de la imagen completados; `npm ci` reportó cero vulnerabilidades.
- PostgreSQL 17.11 y web saludables; worker en ejecución. Migraciones y creación de claves terminaron con código 0.
- Web publicada en `127.0.0.1:3000`; PostgreSQL queda dentro de la red Compose.
- Trece migraciones aplicadas. Una segunda ejecución no aplicó ninguna de nuevo.
- La prueba Playwright `tests/e2e/core-flow.spec.ts` pasó contra Docker: login, creación de caso, carga de PO/factura, discrepancia y revisión humana.
- Después de `docker compose down` y `docker compose up -d --wait`, permanecieron el usuario, el caso, los dos documentos, la revisión y las trece migraciones. Las huellas de las cuatro claves públicas AP2 también fueron idénticas.
- Tras recrear los contenedores, salud, login y consulta autenticada de casos devolvieron HTTP 200.

Las credenciales locales están fuera de Git. Esta verificación no demuestra una operación con Reap ni una llamada real a OpenAI; sus requisitos pendientes figuran en [readiness.md](../readiness.md).

## Diez PO y tarjeta predeterminada

- El seed se ejecutó dos veces en una base temporal aislada: creó diez PO/casos y después cero; conservó una edición de un caso. En el sandbox existente reconoció las diez PO sin duplicar registros.
- La imagen se reconstruyó y `docker compose up -d --wait` terminó con web y PostgreSQL saludables y worker activo. Se aplicó la migración 0014 para metadatos enmascarados del enrollment.
- Typecheck, lint y las 27 pruebas unitarias/de integración PostgreSQL pasaron. Una mutación temporal que eliminaba la condición `ACTIVE` fue detectada por la prueba; se restauró el código y volvió a pasar.
- Chromium mostró la tarjeta predeterminada enmascarada y pendiente de activación en escritorio y móvil, junto con las diez PO. El endpoint del método de pago devolvió 401 sin sesión y 200 con sesión, incluyendo únicamente los metadatos esperados. Las capturas permanecen en `.local/verification/`, fuera de Git.
- Se observó un 404 de `/favicon.ico`, archivo también ausente antes del cambio. No hubo errores JavaScript ni errores en las consultas de tarjeta o casos.
- La llave se guardó únicamente en la configuración local excluida de Git. No se almacenaron PAN, CVV ni OTP. El registro real en Reap continúa pendiente de propietario/correo y retorno HTTPS.
