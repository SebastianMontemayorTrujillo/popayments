'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { readApi, sendApi } from '../components/api';
import type { DefaultCard } from '@/modules/reap-payments/default-card';

interface CaseItem { id: string; title: string; status: string; createdAt: string }
interface CasesReply { items: CaseItem[]; pagination: { page: number; pageSize: number; totalItems: number } }
interface Enrollment { id: string; status: string; nextActionUrl: string | null; providerId: string | null }

export default function CasesPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [defaultCard, setDefaultCard] = useState<DefaultCard | null>(null);

  useEffect(() => {
    readApi<CasesReply>('/api/v1/cases').then((reply) => setCases(reply.items)).catch((cause) => setError(cause.message));
    readApi<Enrollment[]>('/api/v1/enrollments').then((rows) => setEnrollment(rows[0] ?? null)).catch((cause) => setError(cause.message));
  }, []);

  useEffect(() => {
    readApi<DefaultCard | null>('/api/v1/payment-method').then(setDefaultCard).catch((cause) => setError(cause.message));
  }, [enrollment]);

  async function enroll() {
    setBusy(true); setError('');
    try { setEnrollment(await sendApi<Enrollment>('/api/v1/enrollments', 'POST')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo iniciar el enrollment'); }
    finally { setBusy(false); }
  }

  async function updateEnrollment(retry: boolean) {
    if (!enrollment) return;
    setBusy(true); setError('');
    try { setEnrollment(retry ? await sendApi<Enrollment>(`/api/v1/enrollments/${enrollment.id}/retry`, 'POST')
      : await readApi<Enrollment>(`/api/v1/enrollments/${enrollment.id}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo consultar Reap'); }
    finally { setBusy(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await sendApi<CaseItem>('/api/v1/cases', 'POST', { title });
      window.location.assign(`/cases/${result.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear'); setBusy(false); }
  }

  return <main className="content">
    <div className="page-heading"><div><p className="eyebrow">Cuentas por Pagar</p><h1>Casos de compra</h1><p>Cada caso conserva la PO, factura, autorización y resultado del pago.</p></div><span className="badge">Sandbox</span></div>
    <section className="panel" aria-labelledby="instrument"><p className="eyebrow">Instrumento de pago</p><h2 id="instrument">Tarjeta de prueba en Reap</h2>
      {defaultCard && <div aria-live="polite"><p>Tarjeta predeterminada: <strong>•••• {defaultCard.last4}</strong> · Vencimiento {String(defaultCard.expiryMonth).padStart(2, '0')}/{String(defaultCard.expiryYear).slice(-2)}</p>
        <p>{defaultCard.status === 'ACTIVE' ? 'Activa en Reap.' : 'Pendiente de activación. Completa el registro en Reap para usar esta tarjeta.'}</p></div>}
      {enrollment ? <><p>Estado: <strong>{enrollment.status.replaceAll('_', ' ')}</strong></p>
        {enrollment.nextActionUrl && <p><a href={enrollment.nextActionUrl}>Completar registro alojado en Reap</a></p>}
        <button type="button" onClick={() => updateEnrollment(false)} disabled={busy || !enrollment.providerId}>Consultar estado</button>
        {enrollment.status === 'UNKNOWN' && <button type="button" onClick={() => updateEnrollment(true)} disabled={busy}>Reintentar misma solicitud</button>}
      </> : <><p>Registra la tarjeta existente en la página alojada por Reap. Esta aplicación no recibe número ni CVV.</p><button type="button" onClick={enroll} disabled={busy}>Iniciar registro</button></>}
    </section>
    <section className="panel" aria-labelledby="new-case"><h2 id="new-case">Nuevo caso</h2><form className="inline-form" onSubmit={create}><div><label htmlFor="case-title">Nombre de la compra</label><input id="case-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder="Equipo para nueva oficina" /></div><button className="primary" disabled={busy}>{busy ? 'Creando…' : 'Crear caso'}</button></form></section>
    {error && <p role="alert" className="error">{error}</p>}
    <section aria-labelledby="existing-cases"><h2 id="existing-cases">Casos recientes</h2>{cases.length ? <div className="table-wrap"><table><thead><tr><th>Compra</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>{cases.map((item) => <tr key={item.id}><td>{item.title}</td><td><span className="status">{item.status.replaceAll('_', ' ')}</span></td><td>{new Date(item.createdAt).toLocaleDateString('es-MX')}</td><td><Link href={`/cases/${item.id}`}>Ver caso</Link></td></tr>)}</tbody></table></div> : <div className="empty">Todavía no hay casos. Crea uno para cargar una PO.</div>}</section>
  </main>;
}
