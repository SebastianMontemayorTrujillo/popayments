import type { Money } from '@/shared/money';
import { parseMinor, sameMoney } from '@/shared/money';
import type { DocumentRef } from '@/modules/documents/contracts';
import type { PurchaseAuthorization, QuoteSnapshot } from './contracts';

type Evaluation = { allowed: true } | { allowed: false; reason: string };
function sameRef(a: DocumentRef, b: DocumentRef): boolean {
  return a.documentId === b.documentId && a.version === b.version && a.sourceHash === b.sourceHash && a.canonicalHash === b.canonicalHash;
}

export function evaluateAutomaticGrant(input: {
  authorization: PurchaseAuthorization;
  po: DocumentRef;
  invoice: DocumentRef;
  invoiceTotal: Money;
  reconciliationStatus: 'MATCHED' | 'MISMATCHED';
  quote: QuoteSnapshot;
  now: string;
}): Evaluation {
  const { authorization, po, invoice, invoiceTotal, reconciliationStatus, quote, now } = input;
  if (authorization.state !== 'ACTIVE' || now >= authorization.expiresAt) return { allowed: false, reason: 'AUTHORIZATION_EXPIRED' };
  if (!sameRef(authorization.po, po)) return { allowed: false, reason: 'PO_CHANGED' };
  if (!invoice.documentId || invoice.version < 1) return { allowed: false, reason: 'INVALID_INVOICE' };
  if (reconciliationStatus !== 'MATCHED') return { allowed: false, reason: 'REVIEW_REQUIRED' };
  if (now >= quote.expiresAt) return { allowed: false, reason: 'QUOTE_EXPIRED' };
  if (quote.merchantId !== 'acteck' || quote.merchantId !== authorization.merchantId) return { allowed: false, reason: 'MERCHANT_CHANGED' };
  if (quote.purchasePlanHash !== authorization.purchasePlanHash) return { allowed: false, reason: 'PLAN_CHANGED' };
  if (quote.amount.currency !== authorization.currency || !sameMoney(quote.amount, invoiceTotal)) return { allowed: false, reason: 'PRICE_CHANGED' };
  if (parseMinor(quote.amount.minorUnits) > parseMinor(authorization.maxMinorUnits)) return { allowed: false, reason: 'OVER_LIMIT' };
  return { allowed: true };
}
