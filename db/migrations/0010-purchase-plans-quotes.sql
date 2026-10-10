CREATE TABLE purchase_plans (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES cases(id),
  po_ref jsonb NOT NULL,
  selections jsonb NOT NULL,
  shipping_address jsonb NOT NULL,
  hash text NOT NULL,
  merchant_website text NOT NULL,
  created_by uuid NOT NULL REFERENCES demo_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, hash)
);

CREATE TABLE reap_quotes (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES cases(id),
  plan_id uuid NOT NULL REFERENCES purchase_plans(id),
  provider_id text UNIQUE,
  status text NOT NULL CHECK (status IN ('UNKNOWN','READY','EXPIRED')),
  idempotency_key text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  snapshot jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reap_quotes_case ON reap_quotes (case_id,created_at DESC);
