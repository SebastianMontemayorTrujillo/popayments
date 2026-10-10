CREATE TABLE payment_intents (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES cases(id),
  grant_id uuid NOT NULL UNIQUE REFERENCES payment_grants(id),
  evidence_id uuid NOT NULL REFERENCES ap2_evidence(id),
  idempotency_key text NOT NULL UNIQUE,
  request_body jsonb NOT NULL,
  request_hash text NOT NULL,
  return_state_hash text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('RESERVED','SUBMITTING','UNKNOWN','REQUIRES_ACTION','PROCESSING','COMPLETED','FAILED','EXPIRED')),
  checkout_id text UNIQUE,
  order_id text,
  final_amount jsonb,
  next_action_url text,
  amount_mismatch boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 0,
  last_error_code text,
  next_poll_at timestamptz NOT NULL DEFAULT now(),
  leased_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_intents_poll ON payment_intents (next_poll_at,created_at)
WHERE status IN ('RESERVED','SUBMITTING','UNKNOWN','REQUIRES_ACTION','PROCESSING');

CREATE TABLE payment_status_events (
  id uuid PRIMARY KEY,
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id),
  status text NOT NULL,
  checkout_id text,
  order_id text,
  final_amount jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
