'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { readApi, sendApi } from '../../components/api';
import { formatMajor } from '@/shared/money';

interface Ref { documentId: string; version: number; sourceHash: string; canonicalHash: string }
interface Difference { field: string; poValue: string; invoiceValue: string }
interface CaseDetail { id: string; title: string; version: number; status: string; po: Ref | null; invoice: Ref | null;
  reconciliation: { id: string; status: string; differences: Difference[] } | null; review: { id: string; createdAt: string } | null;
  purchasePlan: { id: string; hash: string; merchantWebsite: string; shippingAddress: { firstName: string; lastName: string; addressLine1: string; addressLine2?: string; city: string; region?: string; postalCode?: string; country: string };
    selections: { sku: string; variantId: string; quantity: number; price: { currency: string; minorUnits: string } }[] } | null;
  authorization: { id: string; state: string; maxMinorUnits: string; currency: string; expiresAt: string } | null;
  quote: { id: string; status: string; snapshot: { amount: { currency: string; minorUnits: string }; expiresAt: string; termsHash: string } | null } | null;
  grant: { id: string; state: string } | null; evidence: { id: string; checkoutHash: string; grantId: string } | null;
  payment: { paymentIntentId: string; status: string; checkoutId: string | null; orderId: string | null;
    finalAmount: { currency: string; minorUnits: string } | null; nextActionUrl: string | null; amountMismatch: boolean } | null;
  agent: { id: string; status: string; toolCalls: number; summary: string | null; errorCode: string | null } | null }
interface HistoryEvent { at: string; kind: string; details: unknown }
interface PoData { data: { items: { sku: string; description: string; quantity: number }[]; total: { currency: string; minorUnits: string } } }
interface Product { id: string; name: string; previewVariant?: { id: string; price: { currency: string; amount: number } } }
interface Enrollment { id: string; status: string; providerId: string | null }
const fieldLabels: Record<string, string> = { PO_REFERENCE: 'Referencia de PO', SUPPLIER: 'Proveedor', CURRENCY: 'Moneda', TOTAL: 'Total en centavos' };

export default function CasePage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<CaseDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [poData, setPoData] = useState<PoData | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [agentQueued, setAgentQueued] = useState(false);
  const refresh = useCallback(() => { readApi<CaseDetail>(`/api/v1/cases/${id}`).then(setItem).catch((cause) => setError(cause.message)); }, [id]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { readApi<HistoryEvent[]>(`/api/v1/cases/${id}/events`).then(setEvents).catch(() => undefined); }, [id, item?.agent?.status, item?.payment?.status]);
  useEffect(() => { if (!agentQueued) return; const timer = window.setTimeout(() => setAgentQueued(false), 65_000);
    return () => window.clearTimeout(timer); }, [agentQueued]);
  useEffect(() => {
    const paymentPending = Boolean(item?.payment && !['COMPLETED','FAILED','EXPIRED'].includes(item.payment.status));
    if (!agentQueued && item?.agent?.status !== 'RUNNING' && !paymentPending) return;
    const timer = window.setInterval(refresh, 5_000);
    return () => window.clearInterval(timer);
  }, [agentQueued, item?.agent?.status, item?.payment?.status, refresh]);
  useEffect(() => {
    if (!item?.po) return;
    readApi<PoData>(`/api/v1/documents/${item.po.documentId}/versions/${item.po.version}`).then(setPoData).catch((cause) => setError(cause.message));
    readApi<Enrollment[]>('/api/v1/enrollments').then((rows) => setEnrollment(rows.find((row) => row.status === 'ACTIVE') ?? null)).catch((cause) => setError(cause.message));
  }, [item?.po?.documentId, item?.po?.version]);

  async function upload(event: FormEvent<HTMLFormElement>, role: 'PO' | 'INVOICE') {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    if (!(file instanceof File) || !item) return;
    setBusy(true); setError('');
    try {
      const body = new FormData(); body.set('file', file); body.set('kind', role);
      const document = await sendApi<Ref>('/api/v1/documents', 'POST', body);
      await sendApi(`/api/v1/cases/${id}/documents`, 'POST', { role, document, expectedCaseVersion: item.version });
      refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar el documento'); }
    finally { setBusy(false); }
  }

  async function reconcile() {
    if (!item?.po || !item.invoice) return;
    setBusy(true); setError('');
    try { await sendApi('/api/v1/reconciliations', 'POST', { caseId: id, po: item.po, invoice: item.invoice }); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo conciliar'); }
    finally { setBusy(false); }
  }

  async function review() {
    if (!item?.reconciliation) return;
    setBusy(true); setError('');
    try { await sendApi(`/api/v1/cases/${id}/review`, 'POST', { reconciliationId: item.reconciliation.id, expectedCaseVersion: item.version }); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar la revisión'); }
    finally { setBusy(false); }
  }

  async function reject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item) return;
    setBusy(true); setError('');
    try { await sendApi(`/api/v1/cases/${id}/reject`, 'POST', { expectedCaseVersion: item.version, justification: rejectionReason }); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo rechazar el pago'); }
    finally { setBusy(false); }
  }

  async function searchProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { setProducts(await sendApi<Product[]>('/api/v1/products/search', 'POST', { query: search })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo buscar en Acteck'); }
    finally { setBusy(false); }
  }

  async function createPlan() {
    if (!item || !poData) return;
    setBusy(true); setError('');
    try {
      await sendApi('/api/v1/purchase-plans', 'POST', { caseId: id, expectedCaseVersion: item.version,
        selections: poData.data.items.map((part) => ({ sku: part.sku, productId: chosen[part.sku], quantity: part.quantity })) });
      refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear el plan'); }
    finally { setBusy(false); }
  }

  async function approvePo() {
    if (!item?.purchasePlan || !enrollment) return;
    setBusy(true); setError('');
    try { await sendApi(`/api/v1/cases/${id}/approve-po`, 'POST', { expectedCaseVersion: item.version,
      planId: item.purchasePlan.id, enrollmentId: enrollment.id }); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo autorizar la PO'); }
    finally { setBusy(false); }
  }

  async function createQuote() {
    if (!item?.purchasePlan) return;
    setBusy(true); setError('');
    try { await sendApi('/api/v1/quotes', 'POST', { caseId: id, planId: item.purchasePlan.id }); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cotizar'); }
    finally { setBusy(false); }
  }

  async function grant(mode: 'AUTO' | 'AUTHORIZE_EXCEPTION' | 'AUTHORIZE_QUOTE_CHANGE') {
    if (!item?.quote) return;
    setBusy(true); setError('');
    try { await sendApi(`/api/v1/cases/${id}/grants`, 'POST', { quoteId: item.quote.id, mode, justification: mode === 'AUTO' ? undefined : exceptionReason }); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo autorizar el pago'); }
    finally { setBusy(false); }
  }

  async function bindEvidence() {
    if (!item?.grant) return;
    setBusy(true); setError('');
    try { await sendApi(`/api/v1/cases/${id}/evidence`, 'POST', { grantId: item.grant.id }); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo verificar la evidencia AP2'); }
    finally { setBusy(false); }
  }

  async function pay() {
    if (!item?.grant || !item.evidence) return;
    setBusy(true); setError('');
    try { await sendApi(`/api/v1/cases/${id}/pay`, 'POST', { grantId: item.grant.id, evidenceId: item.evidence.id }); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo confirmar el checkout'); refresh(); }
    finally { setBusy(false); }
  }

  async function refreshPayment() {
    if (!item?.payment) return;
    setBusy(true); setError('');
    try { await sendApi(`/api/v1/payments/${item.payment.paymentIntentId}/refresh`, 'POST'); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo consultar el pago'); }
    finally { setBusy(false); }
  }

  async function resumeAgent() {
    setBusy(true); setError('');
    try { await sendApi(`/api/v1/cases/${id}/resume`, 'POST'); setAgentQueued(true); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo iniciar el agente'); }
    finally { setBusy(false); }
  }

  return <main className="content">
    <Link href="/cases" className="back-link">← Volver a casos</Link>
    {!item ? <p aria-live="polite">Cargando caso…</p> : <>
      <div className="page-heading"><div><p className="eyebrow">Caso {item.id.slice(0, 8)}</p><h1>{item.title}</h1><p>Estado: <strong>{item.status.replaceAll('_', ' ')}</strong></p></div><span className="badge">Sandbox</span></div>
      <div className="two-columns">
        {(['PO', 'INVOICE'] as const).map((role) => {
          const ref = role === 'PO' ? item.po : item.invoice;
          return <section className="panel" key={role} aria-label={role === 'PO' ? 'Orden de compra' : 'Factura'}><p className="eyebrow">{role === 'PO' ? '01 · Compra' : '02 · Cobro'}</p><h2>{role === 'PO' ? 'Orden de compra' : 'Factura'}</h2>
            {ref ? <><p>Versión {ref.version} · Documento cargado</p><a href={`/api/v1/documents/${ref.documentId}/versions/${ref.version}/original`}>Descargar original</a></> : <form onSubmit={(event) => upload(event, role)}><label htmlFor={`file-${role}`}>Archivo JSON o XML</label><input id={`file-${role}`} name="file" type="file" accept=".json,.xml" required /><button className="primary" disabled={busy}>Cargar {role === 'PO' ? 'PO' : 'factura'}</button></form>}
          </section>;
        })}
      </div>
      <section className="panel" aria-labelledby="comparison"><div className="section-title"><div><p className="eyebrow">03 · Verificación</p><h2 id="comparison">Conciliación documental</h2></div>{item.po && item.invoice && !item.reconciliation && <button className="primary" onClick={reconcile} disabled={busy}>Conciliar</button>}</div>
        {item.reconciliation ? <><p className={item.reconciliation.status === 'MATCHED' ? 'success' : 'warning'}>{item.reconciliation.status === 'MATCHED' ? 'Los cuatro campos coinciden.' : 'Advertencia. La PO y la factura no coinciden.'}</p><div className="table-wrap"><table><thead><tr><th>Campo</th><th>PO</th><th>Factura</th></tr></thead><tbody>{item.reconciliation.differences.length ? item.reconciliation.differences.map((difference) => <tr key={difference.field}><th scope="row">{fieldLabels[difference.field] ?? difference.field}</th><td>{difference.poValue}</td><td>{difference.invoiceValue}</td></tr>) : <tr><td colSpan={3}>Referencia, proveedor, moneda y total verificados.</td></tr>}</tbody></table></div></> : <p>La comparación estará disponible cuando ambos documentos estén vinculados.</p>}
      </section>
      <section className="panel" aria-labelledby="agent"><p className="eyebrow">Coordinación</p><h2 id="agent">Agente de Cuentas por Pagar</h2>
        <p>El agente consulta el caso y ejecuta herramientas bajo las reglas del servidor. Solo una persona puede autorizar la PO o excepciones.</p>
        <button type="button" onClick={resumeAgent} disabled={busy}>Reanudar agente</button>
        {item.agent && <p aria-live="polite">Estado: {item.agent.status}. Herramientas usadas: {item.agent.toolCalls}.
          {item.agent.errorCode && ` Código: ${item.agent.errorCode}.`}</p>}
        {item.agent?.summary && <p>{item.agent.summary}</p>}
      </section>
      {poData && item.status !== 'REJECTED' && <section className="panel" aria-labelledby="purchase-plan"><p className="eyebrow">04 · Compra</p><h2 id="purchase-plan">Plan para Acteck</h2>
        <p>PO: {poData.data.total.currency} {formatMajor(poData.data.total as { currency: 'MXN' | 'USD'; minorUnits: string })}. La compra requiere un instrumento ACTIVE.</p>
        {item.purchasePlan ? <div><p>Vendedor: Acteck · {item.purchasePlan.merchantWebsite}</p>
          <p>Entrega: {item.purchasePlan.shippingAddress.firstName} {item.purchasePlan.shippingAddress.lastName}, {item.purchasePlan.shippingAddress.addressLine1}{item.purchasePlan.shippingAddress.addressLine2 ? `, ${item.purchasePlan.shippingAddress.addressLine2}` : ''}, {item.purchasePlan.shippingAddress.city}{item.purchasePlan.shippingAddress.region ? `, ${item.purchasePlan.shippingAddress.region}` : ''}{item.purchasePlan.shippingAddress.postalCode ? ` ${item.purchasePlan.shippingAddress.postalCode}` : ''}, {item.purchasePlan.shippingAddress.country}.</p>
          <ul>{item.purchasePlan.selections.map((part) => <li key={part.sku}>{part.sku} · variante {part.variantId} · {part.quantity} × {part.price.currency} {part.price.minorUnits} centavos</li>)}</ul></div> : <>
          <form onSubmit={searchProducts}><label htmlFor="product-search">Buscar productos de Acteck</label><input id="product-search" value={search} onChange={(event) => setSearch(event.target.value)} minLength={2} maxLength={100} required /><button type="submit" disabled={busy}>Buscar</button></form>
          {poData.data.items.map((part) => <div key={part.sku}><label htmlFor={`product-${part.sku}`}>{part.sku} · {part.description} · cantidad {part.quantity}</label>
            <select id={`product-${part.sku}`} value={chosen[part.sku] ?? ''} onChange={(event) => setChosen({ ...chosen, [part.sku]: event.target.value })}>
              <option value="">Selecciona un producto</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></div>)}
          {products.length > 0 && <button type="button" onClick={createPlan} disabled={busy || poData.data.items.some((part) => !chosen[part.sku])}>Guardar plan</button>}
        </>}
        {item.purchasePlan && !item.authorization && <><p>Instrumento: {enrollment ? 'Activo en Reap' : 'Pendiente. Completa el registro en la lista de casos.'}</p>
          <button type="button" onClick={approvePo} disabled={busy || !enrollment}>Autorizar PO</button></>}
        {item.authorization && <p>PO autorizada hasta {new Date(item.authorization.expiresAt).toLocaleString('es-MX')} para un cargo máximo de {item.authorization.currency} {item.authorization.maxMinorUnits} centavos.</p>}
        {item.authorization && item.reconciliation && !item.quote && <button type="button" onClick={createQuote} disabled={busy}>Crear cotización de Reap</button>}
        {item.quote && <><p>Cotización: {item.quote.status}{item.quote.snapshot && ` · total ${item.quote.snapshot.amount.currency} ${item.quote.snapshot.amount.minorUnits} centavos · vence ${new Date(item.quote.snapshot.expiresAt).toLocaleString('es-MX')}`}</p>
          {item.quote.snapshot && <p>Huella de términos: <code>{item.quote.snapshot.termsHash}</code>. La autorización se limita a este plan, dirección, vendedor e importe.</p>}
          {!item.grant && item.quote.status === 'READY' && item.reconciliation?.status === 'MATCHED' && <button type="button" onClick={() => grant('AUTO')} disabled={busy}>Evaluar permiso automático</button>}
          {!item.grant && item.quote.status === 'READY' && <><label htmlFor="payment-reason">Justificación para una excepción o cambio de precio</label>
            <textarea id="payment-reason" value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} minLength={10} maxLength={1000} />
            {item.review && item.reconciliation?.status === 'MISMATCHED' && <button type="button" onClick={() => grant('AUTHORIZE_EXCEPTION')} disabled={busy || exceptionReason.trim().length < 10}>Autorizar pago con excepción</button>}
            {item.reconciliation?.status === 'MATCHED' && <button type="button" onClick={() => grant('AUTHORIZE_QUOTE_CHANGE')} disabled={busy || exceptionReason.trim().length < 10}>Autorizar cambio de precio</button>}</>}
        </>}
        {item.grant && <p>Permiso de pago: {item.grant.state}. Referencia: {item.grant.id.slice(0, 8)}.</p>}
        {item.grant && !item.evidence && <button type="button" onClick={bindEvidence} disabled={busy}>Crear y verificar evidencia AP2</button>}
        {item.evidence && <p>Evidencia AP2 verificada: {item.evidence.checkoutHash.slice(0, 16)}… <a href={`/api/v1/evidence/${item.evidence.id}/export`}>Exportar credenciales y claves públicas de prueba</a></p>}
        {item.evidence && item.grant?.state === 'AVAILABLE' && !item.payment && <button type="button" onClick={pay} disabled={busy}>Enviar checkout a Reap sandbox</button>}
        {item.payment && <><p>Pago: <strong>{item.payment.status.replaceAll('_', ' ')}</strong>.</p>
          {item.payment.nextActionUrl && <p><a href={item.payment.nextActionUrl}>Completar aprobación en Reap</a></p>}
          {item.payment.orderId && <p>Pedido: {item.payment.orderId}</p>}
          {item.payment.finalAmount && <p>Importe final: {item.payment.finalAmount.currency} {item.payment.finalAmount.minorUnits} centavos.</p>}
          {item.payment.amountMismatch && <p role="alert">El pago ocurrió con una diferencia de importe. Revisa el cargo.</p>}
          {!['COMPLETED','FAILED','EXPIRED'].includes(item.payment.status) && <button type="button" onClick={refreshPayment} disabled={busy || !item.payment.checkoutId}>Consultar Reap</button>}
        </>}
      </section>}
      {item.reconciliation?.status === 'MISMATCHED' && item.status !== 'REJECTED' && <section className="panel" aria-labelledby="decision">
        <p className="eyebrow">04 · Decisión humana</p><h2 id="decision">Revisar discrepancias</h2>
        {item.review ? <p>Factura revisada y registrada el {new Date(item.review.createdAt).toLocaleString('es-MX')}.</p>
          : <button type="button" onClick={review} disabled={busy}>Marcar factura como revisada</button>}
        <form onSubmit={reject}><label htmlFor="rejection-reason">Motivo para rechazar el pago</label>
          <textarea id="rejection-reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} minLength={10} maxLength={1000} required />
          <button type="submit" disabled={busy || rejectionReason.trim().length < 10}>Rechazar pago</button></form>
      </section>}
      <section className="panel" aria-labelledby="history"><h2 id="history">Historial verificable</h2>
        {events.length ? <ol>{events.map((event, index) => <li key={`${event.at}-${index}`}><time dateTime={event.at}>{new Date(event.at).toLocaleString('es-MX')}</time> · {event.kind}</li>)}</ol>
          : <p>Aún no hay decisiones, herramientas o pagos registrados.</p>}
      </section>
    </>}
    {error && <p role="alert" className="error">{error}</p>}
  </main>;
}
