import { z } from 'zod';
import { normalizeMinor } from '@/shared/money';

const label = (max = 100) => z.string().transform((s) => s.trim().normalize('NFC')).pipe(z.string().min(1).max(max));
const amount = z.string().regex(/^\d+$/).refine((s) => BigInt(s) > 0n).transform(normalizeMinor);

const item = z.strictObject({
  sku: label(100),
  description: label(500),
  quantity: z.number().int().positive(),
  unitPriceMinorUnits: amount,
});

export const documentSchema = z.strictObject({
  schemaVersion: z.literal('1'),
  kind: z.enum(['PO', 'INVOICE']),
  documentNumber: label(),
  poReference: label(),
  supplierId: label(),
  supplierName: label(200),
  issuedAt: z.iso.date().refine((date) => !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date),
  total: z.strictObject({
    currency: z.enum(['MXN', 'USD']),
    minorUnits: amount,
  }),
  items: z.array(item).max(50).default([]),
}).superRefine((document, context) => {
  if (document.kind === 'PO' && document.documentNumber !== document.poReference) {
    context.addIssue({ code: 'custom', path: ['poReference'], message: 'La PO debe referirse a su propio número' });
  }
  if (document.kind === 'PO' && document.items.length === 0) {
    context.addIssue({ code: 'custom', path: ['items'], message: 'La PO requiere partidas' });
  }
});
