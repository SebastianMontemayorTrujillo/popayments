import { z } from 'zod';
import { AppError } from '@/shared/errors';
import { listEnrollments, type EnrollmentView } from './enrollments';

const preferenceSchema = z.object({ last4: z.string().regex(/^\d{4}$/),
  expiryMonth: z.coerce.number().int().min(1).max(12), expiryYear: z.coerce.number().int().min(2000).max(9999) });
type CardPreference = z.infer<typeof preferenceSchema>;
export interface DefaultCard extends CardPreference {
  network: string | null;
  status: 'PENDING_ENROLLMENT' | 'ACTIVE';
  enrollmentId: string | null;
}

function configuredPreference(): CardPreference | null {
  const last4 = process.env.REAP_DEFAULT_CARD_LAST4?.trim();
  const expiryMonth = process.env.REAP_DEFAULT_CARD_EXPIRY_MONTH?.trim();
  const expiryYear = process.env.REAP_DEFAULT_CARD_EXPIRY_YEAR?.trim();
  if (!last4 && !expiryMonth && !expiryYear) return null;
  const parsed = preferenceSchema.safeParse({ last4, expiryMonth, expiryYear });
  if (!parsed.success) throw new AppError(503, 'DEFAULT_CARD_CONFIG', 'Revisa los datos enmascarados de la tarjeta predeterminada');
  return parsed.data;
}

export function selectDefaultCard(enrollments: EnrollmentView[], preference: CardPreference | null): DefaultCard | null {
  const selected = enrollments.find((item) => item.status === 'ACTIVE' && item.providerId && item.paymentMethod &&
    (!preference || (item.paymentMethod.last4 === preference.last4 && item.paymentMethod.expiryMonth === preference.expiryMonth &&
      item.paymentMethod.expiryYear === preference.expiryYear)));
  const card = selected?.paymentMethod;
  if (selected && card) return { last4: card.last4, expiryMonth: card.expiryMonth, expiryYear: card.expiryYear,
    network: card.network, status: 'ACTIVE', enrollmentId: selected.id };
  return preference ? { ...preference, network: null, status: 'PENDING_ENROLLMENT', enrollmentId: null } : null;
}

export async function getDefaultCard(): Promise<DefaultCard | null> {
  return selectDefaultCard(await listEnrollments(), configuredPreference());
}
