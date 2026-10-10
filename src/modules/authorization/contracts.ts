import type { Currency, Money } from '@/shared/money';
import type { DocumentRef } from '@/modules/documents/contracts';

export interface QuoteSnapshot {
  quoteId: string;
  merchantId: string;
  merchantWebsite: string;
  purchasePlanHash: string;
  amount: Money;
  expiresAt: string;
  termsHash: string;
}
export interface PurchaseAuthorization {
  id: string;
  caseId: string;
  po: DocumentRef;
  actorId: string;
  purchasePlanHash: string;
  merchantId: string;
  enrollmentId: string;
  currency: Currency;
  maxMinorUnits: string;
  expiresAt: string;
  state: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
}
export interface PaymentGrant {
  id: string;
  authorizationId: string;
  decisionId: string | null;
  caseId: string;
  po: DocumentRef;
  invoice: DocumentRef;
  reconciliationId: string;
  quote: QuoteSnapshot;
  enrollmentId: string;
  expiresAt: string;
  state: 'AVAILABLE' | 'RESERVED' | 'CONSUMED' | 'REVOKED' | 'EXPIRED';
}
