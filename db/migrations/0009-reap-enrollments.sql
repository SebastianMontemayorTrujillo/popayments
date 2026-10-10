CREATE TABLE reap_enrollments (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  owner_email text NOT NULL,
  provider_id text UNIQUE,
  status text NOT NULL CHECK (status IN ('UNKNOWN','REQUIRES_ACTION','ACTIVE','FAILED','EXPIRED','REVOKED')),
  next_action_url text,
  return_state_hash text NOT NULL UNIQUE,
  return_url text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reap_enrollments_owner ON reap_enrollments (owner_id,created_at DESC);
CREATE UNIQUE INDEX reap_enrollments_one_live_owner ON reap_enrollments (owner_id)
WHERE status IN ('UNKNOWN','REQUIRES_ACTION','ACTIVE');
