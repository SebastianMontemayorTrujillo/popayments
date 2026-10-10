import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { findEnrollmentByReturnState, getEnrollment } from '@/modules/reap-payments/enrollments';
import { authenticatedToken } from '@/shared/session';
import { findPaymentByReturnState, refreshPayment } from '@/modules/reap-payments/payments';

export default async function ReturnPage({ searchParams }: { searchParams: Promise<{ state?: string; intent?: string }> }) {
  const { state, intent } = await searchParams;
  if (!state) return <main className="content"><h1>Retorno inválido</h1><p>Falta la referencia del proceso alojado.</p></main>;
  const token = (await cookies()).get('popayments_session')?.value;
  if (!token) redirect('/login');
  try { await authenticatedToken(token); } catch { redirect('/login'); }
  if (intent) {
    try {
      await findPaymentByReturnState(intent, state);
      const payment = await refreshPayment(intent);
      return <main className="content"><h1>Estado del pago</h1><p>Reap informa: <strong>{payment.status}</strong>.</p>
        {payment.orderId && <p>Pedido: {payment.orderId}</p>}
        {payment.amountMismatch && <p role="alert">El cargo se completó con una diferencia de importe.</p>}
        <p>El retorno por sí solo no confirma el cargo; este estado viene de la consulta a Reap.</p><Link href="/cases">Volver a casos</Link></main>;
    } catch {
      return <main className="content"><h1>No se pudo verificar el pago</h1><p>Consulta el estado desde la aplicación.</p><Link href="/cases">Volver a casos</Link></main>;
    }
  }
  try {
    const enrollment = await findEnrollmentByReturnState(state);
    const current = await getEnrollment(enrollment.id, true);
    return <main className="content"><h1>Estado del instrumento</h1><p>Reap informa: <strong>{current.status}</strong>.</p>
      <p>El retorno del navegador no confirma por sí mismo que la tarjeta esté activa.</p><Link href="/cases">Volver a casos</Link></main>;
  } catch {
    return <main className="content"><h1>No se pudo verificar el retorno</h1><p>Consulta el estado desde la aplicación.</p><Link href="/cases">Volver a casos</Link></main>;
  }
}
