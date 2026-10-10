'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { readApi, sendApi } from '../../components/api';

interface Ref { documentId: string; version: number; sourceHash: string; canonicalHash: string }
interface Difference { field: string; poValue: string; invoiceValue: string }
interface CaseDetail { id: string; title: string; version: number; status: string; po: Ref | null; invoice: Ref | null; reconciliation: { status: string; differences: Difference[] } | null }
const fieldLabels: Record<string, string> = { PO_REFERENCE: 'Referencia de PO', SUPPLIER: 'Proveedor', CURRENCY: 'Moneda', TOTAL: 'Total en centavos' };

export default function CasePage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<CaseDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => { readApi<CaseDetail>(`/api/v1/cases/${id}`).then(setItem).catch((cause) => setError(cause.message)); }, [id]);
  useEffect(() => { refresh(); }, [refresh]);

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
    </>}
    {error && <p role="alert" className="error">{error}</p>}
  </main>;
}
