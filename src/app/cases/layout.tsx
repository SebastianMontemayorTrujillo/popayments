import Link from 'next/link';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { authenticated } from '@/shared/session';

export default async function CasesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const header = (await cookies()).toString();
  try {
    await authenticated(new NextRequest('http://localhost/cases', { headers: { cookie: header } }));
  } catch { redirect('/login'); }
  return <div className="app-shell">
    <header className="app-header"><div className="header-inner"><Link href="/cases" className="brand">PoPayments</Link><span>Compras de equipo · Acteck</span><Link href="/cases">Casos</Link></div></header>
    {children}
    <footer className="app-footer">Entorno sandbox · Las compras no mueven dinero real</footer>
  </div>;
}
