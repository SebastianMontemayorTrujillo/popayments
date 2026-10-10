import Link from 'next/link';

export default function Home() {
  return <main className="shell">
    <header className="masthead"><strong>PoPayments</strong><span>Demo de Cuentas por Pagar</span></header>
    <section className="hero">
      <p className="eyebrow">Compra de equipo · Acteck</p>
      <h1>Pagos respaldados por una PO autorizada.</h1>
      <p>Carga documentos, revisa sus diferencias y sigue el resultado del pago en sandbox.</p>
      <Link className="button" href="/cases">Abrir casos</Link>
    </section>
    <footer>Entorno de demostración · Sin dinero real</footer>
  </main>;
}
