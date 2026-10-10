'use client';

import { useState, type FormEvent } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const reply = await fetch('/api/v1/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      if (!reply.ok) {
        const detail = await reply.json();
        throw new Error(detail.error?.message ?? 'No se pudo iniciar sesión');
      }
      window.location.assign('/cases');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión'); }
    finally { setBusy(false); }
  }

  return <main className="auth-shell">
    <div className="auth-context"><p className="eyebrow">PoPayments · Sandbox</p><h1>Autoriza compras con evidencia clara.</h1><p>Una vista para revisar la PO, conciliar la factura y seguir cada pago hasta su confirmación.</p></div>
    <section className="auth-card" aria-labelledby="login-title">
      <h2 id="login-title">Iniciar sesión</h2>
      <p>Acceso de Cuentas por Pagar</p>
      <form onSubmit={submit}>
        <label htmlFor="email">Correo</label><input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <label htmlFor="password">Contraseña</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error && <p role="alert" className="error">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Ingresando…' : 'Entrar'}</button>
      </form>
    </section>
  </main>;
}
