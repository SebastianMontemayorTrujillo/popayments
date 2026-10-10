CREATE TABLE ap2_delegations (
  id uuid PRIMARY KEY,
  authorization_id uuid NOT NULL UNIQUE REFERENCES purchase_authorizations(id),
  checkout_open text NOT NULL,
  payment_open text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ap2_evidence (
  id uuid PRIMARY KEY,
  grant_id uuid NOT NULL UNIQUE REFERENCES payment_grants(id),
  quote_id text NOT NULL,
  checkout_jwt text NOT NULL,
  checkout_credential text NOT NULL,
  payment_credential text NOT NULL,
  checkout_hash text NOT NULL,
  nonce text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ap2_verification_receipts (
  id uuid PRIMARY KEY,
  evidence_id uuid NOT NULL REFERENCES ap2_evidence(id),
  token text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ap2_payment_observations (
  id uuid PRIMARY KEY,
  evidence_id uuid NOT NULL REFERENCES ap2_evidence(id),
  checkout_id text NOT NULL,
  order_id text,
  status text NOT NULL,
  final_amount jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
