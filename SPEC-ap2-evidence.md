# Spec: ap2-evidence — mandatos y evidencia verificable

Estado: aprobado por el usuario el 2026-10-09. Módulo del [mapa aprobado](CAPABILITY-MAP.md). Depende de [documents](SPEC-documents.md) y [authorization](SPEC-authorization.md). Consumidores: pagos y workflow.

## Objetivo

Demostrar una cadena criptográfica de consentimiento, delegación y compra concreta con identidades de prueba. Vincular cada evidencia a PO, factura, decisión e importe. La evidencia es verificable localmente; no se atribuyen firmas a Acteck o Reap ni se afirma que Reap reciba o valide credenciales AP2.

## Perfil fijado y roles

Propuesta: AP2 v0.2, SD-JWT de RFC 9901 y delegación `draft-gco-oauth-delegate-sd-jwt-00`. Se fija esa revisión del borrador; una actualización requiere revisión del contrato y vectores. Se usa el modelo Trusted Agent Provider: la superficie humana obtiene consentimiento y el emisor de prueba crea los mandatos abiertos. La clave del agente enlaza mandatos cerrados. La lógica y las claves de firma permanecen fuera del modelo. [Especificación AP2](https://ap2-protocol.org/ap2/specification/), [autorización del agente](https://ap2-protocol.org/ap2/agent_authorization/), [RFC 9901](https://datatracker.ietf.org/doc/rfc9901/) y [borrador fijado](https://datatracker.ietf.org/doc/html/draft-gco-oauth-delegate-sd-jwt-00).

Cuatro identidades locales con claves ES256 distintas: `demo-trusted-provider`, `demo-agent`, `demo-merchant-proxy` y `demo-verifier`. La identidad merchant-proxy representa la cotización observada para el ejercicio; no es una firma de Acteck. Registro de confianza local con `kid`, claves públicas y roles. Las claves privadas se guardan fuera de Git y sobreviven a reinicios. No se resuelven `jku` o `x5u` proporcionados por tokens ni algoritmos arbitrarios.

## Mandatos y vínculo

Al aprobar la PO se generan Checkout y Payment Mandates abiertos. Los `vct` son `mandate.checkout.open.1` y `mandate.payment.open.1`. Se incluyen `iss`, `iat`, `exp`, `cnf` con clave pública del agente y las restricciones aprobadas: Acteck, plan/partidas, un cargo, moneda, máximo e instrumento por ID de enrollment. La referencia de pago vincula las restricciones de checkout. Una excepción que cambia autoridad crea nuevos mandatos abiertos a partir de la nueva decisión humana. [Checkout Mandate](https://ap2-protocol.org/ap2/checkout_mandate/) y [Payment Mandate](https://ap2-protocol.org/ap2/payment_mandate/).

Tras obtener la cotización, el proxy de prueba firma un `checkout_jwt` con el snapshot concreto de compra. El Checkout Mandate cerrado usa `mandate.checkout.1` y `checkout_hash = base64url(SHA-256(UTF-8(checkout_jwt)))`. El Payment Mandate cerrado usa `mandate.payment.1`, el mismo hash en `transaction_id`, destinatario, importe entero en unidades menores e instrumento sin datos de tarjeta. Datos de aplicación adicionales van en una extensión `popayments` versionada con DocumentRefs, `authorizationId`, `grantId`, `reconciliationId`, `quoteId` y hashes de plan/términos. Se validan obligatoriamente dentro del perfil local.

La delegación debe respetar la serialización y pruebas de posesión del borrador, incluido `delegate_payload`, vínculo `sd_hash`, audience, nonce y tiempos. No se reemplaza por una lista de JWT independientes. El perfil revela todos los campos necesarios: no se necesita una UI de disclosure selectivo. `jose` aporta firmas y `@sd-jwt/core` la base SD-JWT; se necesita una capa de perfil para delegación y AP2, con vectores verificables. No se da por supuesto que la biblioteca implemente el borrador completo. [Biblioteca SD-JWT](https://sdjwt.js.org/).

## Verificación y recibo

`verifyEvidence` valida estructura, tipos, emisores permitidos, algoritmos, firmas, vigencia y prueba de posesión; comprueba cadena de delegación, restricciones, vínculo checkout/pago y equivalencia exacta con el permiso y cotización actuales. Carga originales normalizados desde documents y recalcula sus hashes. Verifica además revocación y disponibilidad del permiso: AVAILABLE antes de reservar, o RESERVED exclusivamente por el paymentIntentId del contexto de ejecución después de reservar. Restricción desconocida, clave no confiable o campo ausente produce fallo cerrado.

La comprobación de precio/partidas de compra sirve al consentimiento del checkout. No añade comparación de partidas entre PO y factura al resultado documental, que sigue teniendo cuatro campos.

Se emite un receipt firmado por `demo-verifier`, con issuer, resultado y referencia al hash de la credencial final según el perfil AP2. El recibo previo acredita la verificación de evidencia, no el pago. El resultado Reap se adjunta como observación posterior con checkout/orderId y finalAmount. No se denomina receipt emitido por Reap. La vista distingue evidencia válida al momento de ejecución de autorización vigente ahora; un token vencido puede conservar un recibo histórico verificable sin permitir un nuevo cargo.

## Contratos, API y almacenamiento

```typescript
interface EvidenceBundle {
  readonly id: string;
  readonly profile: 'ap2-0.2-dsdjwt-00-demo-v1';
  readonly grantId: string;
  readonly quoteId: string;
  readonly checkoutCredential: string;
  readonly paymentCredential: string;
  readonly checkoutHash: string;
  readonly verificationReceipt: string;
}

type VerificationResult =
  | { readonly valid: true; readonly evidenceId: string }
  | { readonly valid: false; readonly code: string };
```

Servicios: `prepareDelegation(authorizationId)`, `bindEvidence(grantId, quoteSnapshot)`, `verifyEvidence(evidenceId, executionContext)` y `recordPaymentObservation(evidenceId, observation)`. Los servicios leen autoridad persistida; no firman un payload libre enviado por el cliente o el LLM.

`GET /api/v1/evidence/:id` entrega resumen autenticado con roles, hashes, documentos, decisión y resultado; `GET /api/v1/evidence/:id/export` entrega bundle, recibos y claves públicas de prueba. No entrega claves privadas. La generación pertenece al coordinador, sin endpoint público de firma genérica.

Tablas: `ap2_delegations`, `ap2_evidence`, `ap2_verification_receipts`, `ap2_payment_observations`. Material firmado inmutable; una cotización nueva exige otro bundle. Se deduplica por grant y quote/termsHash. Una firma o verificación fallida bloquea envío y conserva error saneado para auditoría.

## Stack, comandos, estructura y estilo

[Convenciones comunes](SPEC-CONVENTIONS.md). TypeScript, jose, SD-JWT y PostgreSQL. `src/modules/ap2-evidence/` contiene profile, issuer, binder y verifier separados. Vectores en `tests/fixtures/ap2/`; tests en `tests/unit/ap2-evidence/` y `tests/integration/ap2-evidence/`.

```bash
npm run test -- --run tests/unit/ap2-evidence tests/integration/ap2-evidence
npm run typecheck
npm run lint
npm run build
```

Ejemplo de estilo:

```typescript
function hashCheckoutJwt(checkoutJwt: string): string {
  return createHash('sha256').update(checkoutJwt, 'utf8').digest('base64url');
}
```

No registrar credenciales completas en logs; el export autenticado es el artefacto de inspección. Verificación independiente de generación, con reloj y registro de confianza inyectados.

## Pruebas y criterios de éxito

- Cadena válida abierta/cerrada y vínculo checkout/pago se verifican con las claves públicas exportadas.
- Vectores comprueban serialización SD-JWT/delegada y hashes exactos contra el perfil fijado; un round-trip de la misma implementación no basta.
- Modificar documento, importe, moneda, destinatario, variante, instrumento, nonce, audience, firma o una referencia invalida la evidencia.
- Clave desconocida, algoritmo inesperado, delegación vencida/revocada, restricciones ausentes o excedidas bloquean checkout.
- Una excepción produce otra autoridad y conserva la cadena anterior, sin firmar documentos como si vinieran de Acteck.
- Reiniciar no rompe claves/bundles previos; expirar el mandato impide cargos nuevos y preserva consulta del recibo histórico.
- El LLM y el navegador no reciben claves privadas ni PAN/CVV/OTP.

## Límites y cuestiones pendientes

Siempre: fijar versiones, validar todos los vínculos y etiquetar las identidades de prueba. Consultar cambios de perfil, interoperabilidad externa o identidades reales. Nunca: inventar firma de merchant, usar una firma válida como permiso ilimitado o afirmar certificación/interoperabilidad sin prueba.

El plan fija @sd-jwt/core 0.22.0 como candidato exacto y exige verificar el perfil contra los vectores del borrador antes de implementar. Si falta una capacidad de delegación, se revisa la spec; no se sustituye silenciosamente por JWT simples.
