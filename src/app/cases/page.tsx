'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { readApi, sendApi } from '../components/api';

interface CaseItem { id: string; title: string; status: string; createdAt: string }
interface CasesReply { items: CaseItem[]; pagination: { page: number; pageSize: number; totalItems: number } }

export default function CasesPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { readApi<CasesReply>('/api/v1/cases').then((reply) => setCases(reply.items)).catch((cause) => setError(cause.message)); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await sendApi<CaseItem>('/api/v1/cases', 'POST', { title });
      window.location.assign(`/cases/${result.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear'); setBusy(false); }
  }

  return <main className="content">
    <div className="page-heading"><div><p className="eyebrow">Cuentas por Pagar</p><h1>Casos de compra</h1><p>Cada caso conserva la PO, factura, autorización y resultado del pago.</p></div><span className="badge">Sandbox</span></div>
    <section className="panel" aria-labelledby="new-case"><h2 id="new-case">Nuevo caso</h2><form className="inline-form" onSubmit={create}><div><label htmlFor="case-title">Nombre de la compra</label><input id="case-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder="Equipo para nueva oficina" /></div><button className="primary" disabled={busy}>{busy ? 'Creando…' : 'Crear caso'}</button></form></section>
    {error && <p role="alert" className="error">{error}</p>}
    <section aria-labelledby="existing-cases"><h2 id="existing-cases">Casos recientes</h2>{cases.length ? <div className="table-wrap"><table><thead><tr><th>Compra</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>{cases.map((item) => <tr key={item.id}><td>{item.title}</td><td><span className="status">{item.status.replaceAll('_', ' ')}</span></td><td>{new Date(item.createdAt).toLocaleDateString('es-MX')}</td><td><Link href={`/cases/${item.id}`}>Ver caso</Link></td></tr>)}</tbody></table></div> : <div className="empty">Todavía no hay casos. Crea uno para cargar una PO.</div>}</section>
  </main>;
}
