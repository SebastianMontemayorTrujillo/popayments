CREATE TABLE purchase_authorizations (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES cases(id),
  po_ref jsonb NOT NULL,
  plan_id uuid NOT NULL,
  plan_hash text NOT NULL,
  merchant_id text NOT NULL,
  enrollment_id text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('MXN','USD')),
  max_minor_units text NOT NULL,
  actor_id uuid NOT NULL REFERENCES demo_users(id),
  state text NOT NULL CHECK (state IN ('ACTIVE','REVOKED','EXPIRED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX purchase_authorizations_case ON purchase_authorizations (case_id, created_at DESC);

CREATE TABLE payment_reviews (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES cases(id),
  reconciliation_id uuid NOT NULL REFERENCES reconciliations(id),
  actor_id uuid NOT NULL REFERENCES demo_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, reconciliation_id)
);

CREATE TABLE payment_decisions (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES cases(id),
  kind text NOT NULL CHECK (kind IN ('AUTHORIZE_EXCEPTION','AUTHORIZE_QUOTE_CHANGE','REJECT')),
  reconciliation_id uuid REFERENCES reconciliations(id),
  quote_id text,
  terms_hash text,
  justification text,
  actor_id uuid NOT NULL REFERENCES demo_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_decisions_case ON payment_decisions (case_id, created_at DESC);

CREATE TABLE payment_grants (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES cases(id),
  authorization_id uuid NOT NULL REFERENCES purchase_authorizations(id),
  decision_id uuid REFERENCES payment_decisions(id),
  po_ref jsonb NOT NULL,
  invoice_ref jsonb NOT NULL,
  reconciliation_id uuid NOT NULL REFERENCES reconciliations(id),
  quote_id text NOT NULL,
  quote_snapshot jsonb NOT NULL,
  enrollment_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('AVAILABLE','RESERVED','CONSUMED','REVOKED','EXPIRED')),
  reserved_intent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, reconciliation_id, quote_id)
);

CREATE TABLE payment_exclusions (
  po_id uuid PRIMARY KEY REFERENCES documents(id),
  invoice_id uuid NOT NULL REFERENCES documents(id),
  payment_intent_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('RESERVED','COMPLETED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
