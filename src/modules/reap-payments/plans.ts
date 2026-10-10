import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { canonicalHash } from '@/shared/canonical-json';
import { database, transaction } from '@/shared/database';
import { AppError } from '@/shared/errors';
import type { DocumentData, DocumentRef } from '@/modules/documents/contracts';
import { ReapClient, reapMoney } from './client';

const address = z.strictObject({ firstName: z.string().min(1), lastName: z.string().min(1), phone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  addressLine1: z.string().min(1), addressLine2: z.string().optional(), city: z.string().min(1), region: z.string().optional(),
  postalCode: z.string().optional(), country: z.string().length(2) });
export interface PlanSelection { sku: string; productId: string; variantId: string; quantity: number; price: { currency: 'MXN' | 'USD'; minorUnits: string } }
export interface PurchasePlan { id: string; caseId: string; po: DocumentRef; selections: PlanSelection[]; shippingAddress: z.infer<typeof address>; hash: string; merchantId: 'acteck'; merchantWebsite: string }
interface PlanRow { id: string; case_id: string; po_ref: DocumentRef; selections: PlanSelection[]; shipping_address: z.infer<typeof address>; hash: string; merchant_website: string }
function plan(row: PlanRow): PurchasePlan { return { id: row.id, caseId: row.case_id, po: row.po_ref, selections: row.selections,
  shippingAddress: row.shipping_address, hash: row.hash, merchantId: 'acteck', merchantWebsite: row.merchant_website }; }

function configuredAddress(): z.infer<typeof address> {
  try { return address.parse(JSON.parse(process.env.REAP_SHIPPING_ADDRESS_JSON ?? '')); }
  catch { throw new AppError(503, 'SHIPPING_ADDRESS_REQUIRED', 'Configura la dirección de envío de la demo'); }
}
function merchantWebsite(): string {
  const value = process.env.REAP_ACTECK_WEBSITE ?? '';
  if (!value.startsWith('https://')) throw new AppError(503, 'ACTECK_WEBSITE_REQUIRED', 'Configura el sitio de Acteck verificado por el equipo');
  return value;
}

export async function createPurchasePlan(input: { caseId: string; expectedCaseVersion: number; selections: { sku: string; productId: string; quantity: number }[]; actorId: string },
  client = new ReapClient()): Promise<PurchasePlan> {
  if (!input.selections.length || input.selections.length > 20) throw new AppError(422, 'INVALID_PLAN', 'El plan necesita entre 1 y 20 variantes');
  const shippingAddress = configuredAddress();
  const website = merchantWebsite();
  const initial = await database().query<{ version: number; po_id: string | null; po_version: number | null }>('SELECT version,po_id,po_version FROM cases WHERE id=$1', [input.caseId]);
  const current = initial.rows[0];
  if (!current || !current.po_id || !current.po_version) throw new AppError(409, 'MISSING_PO', 'Carga una PO primero');
  if (current.version !== input.expectedCaseVersion) throw new AppError(409, 'STALE_CASE', 'El caso cambió');
  const poRow = await database().query<{ source_hash: string; canonical_hash: string; data: DocumentData }>(
    'SELECT source_hash,canonical_hash,data FROM document_versions WHERE document_id=$1 AND version=$2', [current.po_id, current.po_version]);
  const document = poRow.rows[0];
  if (!document || document.data.supplierId !== 'acteck') throw new AppError(422, 'SUPPLIER_NOT_ALLOWED', 'La PO debe identificar a Acteck');
  const po: DocumentRef = { documentId: current.po_id, version: current.po_version, sourceHash: document.source_hash, canonicalHash: document.canonical_hash };
  const expected = new Map(document.data.items.map((item) => [item.sku, item.quantity]));
  if (expected.size !== document.data.items.length || expected.size !== input.selections.length) throw new AppError(422, 'PLAN_ITEMS_MISMATCH', 'Selecciona una variante por partida de la PO');
  const seen = new Set<string>();
  const selections: PlanSelection[] = [];
  for (const item of input.selections) {
    if (seen.has(item.sku) || expected.get(item.sku) !== item.quantity) throw new AppError(422, 'PLAN_ITEMS_MISMATCH', 'Partidas o cantidades diferentes de la PO');
    seen.add(item.sku);
    const product = await client.getActeckProduct(item.productId);
    const variant = product.defaultVariant;
    if (!variant?.id || variant.available === false) throw new AppError(422, 'VARIANT_UNAVAILABLE', 'La variante predeterminada no está disponible');
    const price = reapMoney(variant.price);
    if (price.currency !== document.data.total.currency) throw new AppError(422, 'CURRENCY_MISMATCH', 'La variante usa una moneda distinta a la PO');
    selections.push({ sku: item.sku, productId: item.productId, variantId: variant.id, quantity: item.quantity, price });
  }
  const hash = canonicalHash({ po, selections, shippingAddress, website });
  return transaction(async (sql) => {
    const locked = await sql.query<{ version: number; po_id: string; po_version: number }>('SELECT version,po_id,po_version FROM cases WHERE id=$1 FOR UPDATE', [input.caseId]);
    if (locked.rows[0]?.version !== input.expectedCaseVersion || locked.rows[0].po_id !== po.documentId || locked.rows[0].po_version !== po.version) throw new AppError(409, 'STALE_CASE', 'La PO cambió durante la búsqueda');
    const inserted = await sql.query<PlanRow>(`INSERT INTO purchase_plans(id,case_id,po_ref,selections,shipping_address,hash,merchant_website,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(case_id,hash) DO UPDATE SET hash=EXCLUDED.hash RETURNING *`,
      [randomUUID(), input.caseId, po, JSON.stringify(selections), JSON.stringify(shippingAddress), hash, website, input.actorId]);
    return plan(inserted.rows[0]);
  });
}

export async function getPurchasePlan(id: string): Promise<PurchasePlan> {
  const found = await database().query<PlanRow>('SELECT * FROM purchase_plans WHERE id=$1', [id]);
  if (!found.rows[0]) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plan no encontrado');
  return plan(found.rows[0]);
}

export async function latestPurchasePlan(caseId: string): Promise<PurchasePlan | null> {
  const found = await database().query<PlanRow>('SELECT * FROM purchase_plans WHERE case_id=$1 ORDER BY created_at DESC LIMIT 1', [caseId]);
  return found.rows[0] ? plan(found.rows[0]) : null;
}
