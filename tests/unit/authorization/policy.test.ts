import { describe, expect, it } from 'vitest';
import { evaluateAutomaticGrant } from '../../../src/modules/authorization/policy';
import type { QuoteSnapshot, PurchaseAuthorization } from '../../../src/modules/authorization/contracts';
import type { DocumentRef } from '../../../src/modules/documents/contracts';

const po: DocumentRef = { documentId: 'po', version: 1, sourceHash: 'source-po', canonicalHash: 'hash-po' };
const invoice: DocumentRef = { documentId: 'invoice', version: 1, sourceHash: 'source-invoice', canonicalHash: 'hash-invoice' };
const authorization: PurchaseAuthorization = {
  id: 'auth', caseId: 'case', po, actorId: 'human', purchasePlanHash: 'plan', merchantId: 'acteck',
  enrollmentId: 'card', currency: 'MXN', maxMinorUnits: '116000', expiresAt: '2026-10-10T00:00:00Z', state: 'ACTIVE',
};
const quote: QuoteSnapshot = {
  quoteId: 'quote', merchantId: 'acteck', merchantWebsite: 'https://acteck.com', purchasePlanHash: 'plan',
  amount: { currency: 'MXN', minorUnits: '116000' }, expiresAt: '2026-10-09T23:00:00Z', termsHash: 'terms',
};

describe('permiso automático', () => {
  it('permite la coincidencia exacta dentro de autoridad vigente', () => {
    expect(evaluateAutomaticGrant({ authorization, po, invoice, invoiceTotal: quote.amount, reconciliationStatus: 'MATCHED', quote, now: '2026-10-09T22:00:00Z' })).toEqual({ allowed: true });
  });

  it('bloquea discrepancia, precio modificado, versión nueva o caducidad', () => {
    const input = { authorization, po, invoice, invoiceTotal: quote.amount, reconciliationStatus: 'MATCHED' as const, quote, now: '2026-10-09T22:00:00Z' };
    expect(evaluateAutomaticGrant({ ...input, reconciliationStatus: 'MISMATCHED' }).allowed).toBe(false);
    expect(evaluateAutomaticGrant({ ...input, quote: { ...quote, amount: { currency: 'MXN', minorUnits: '116001' } } }).allowed).toBe(false);
    expect(evaluateAutomaticGrant({ ...input, po: { ...po, version: 2 } }).allowed).toBe(false);
    expect(evaluateAutomaticGrant({ ...input, now: '2026-10-10T00:00:00Z' }).allowed).toBe(false);
  });
});
