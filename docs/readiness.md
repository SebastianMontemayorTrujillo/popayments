# Preparación de la demo en sandbox

Estado al iniciar la implementación: 2026-10-09. Este diagnóstico distingue lo documentado de lo observado con el equipo.

| Requisito | Estado | Evidencia o siguiente verificación |
|---|---|---|
| Base regional Reap | Configurada en la spec | `https://sg.sandbox.api.reap.global`, provista por el equipo. |
| Versión Agentic | Propuesta | La referencia pública enumera `2025-02-14`; validar con la llave del equipo. |
| Enrollment EXTERNAL | Documentado | La API pública lo ofrece y describe retorno alojado. Validar que Agentic esté habilitado para el equipo. |
| Tarjeta de sandbox | Disponible para el equipo | Se introduce solo en la página alojada por Reap. No está copiada en este repositorio. |
| Merchant Acteck y variantes | Desconocido | Búsqueda/detalle de productos del Agentic del equipo; no inferir soporte por el sitio Acteck. |
| Moneda y envío para Acteck | Desconocido | Resolver variante y quote antes de autorizar una PO. |
| Owner y correo de enrollment | Pendiente de configuración | `REAP_OWNER_ID` y `REAP_OWNER_EMAIL` del equipo. |
| Retorno HTTPS | Pendiente del sandbox Docker alojado | Configurar `APP_BASE_URL` público antes de enrollment/checkout. |
| API OpenAI y modelo | Pendiente de configuración | Credencial independiente y modelo con Responses/function calling. |
| Persistencia PostgreSQL y worker | Definidos en Compose | Ejecutar y verificar en el host Docker del sandbox. |
| Vencimiento de llave Reap | Conocido | 2026-10-11 00:00 Ciudad de México; renovar si se ejecuta después. |

Docker Engine y Compose están instalados. El usuario `seb` figura en el grupo `docker`, pero esta sesión se abrió antes del cambio de membresía y no puede acceder al socket. Se preparó un PostgreSQL temporal de usuario para probar migraciones; Compose pasó la validación estática. Tras abrir una sesión que herede el grupo, falta ejecutar `docker compose up --build -d` y comprobar los servicios. Las consultas públicas de documentación no verifican permisos del equipo ni generan pagos.

Fuentes: [setup Agentic](https://docs.reap.global/agentic-payments/setup), [enrollment](https://docs.reap.global/api-reference/agentic/create-enrollment), [cotización](https://docs.reap.global/api-reference/agentic/create-quote), [hackathon](https://aibuilders.mx/reap).
