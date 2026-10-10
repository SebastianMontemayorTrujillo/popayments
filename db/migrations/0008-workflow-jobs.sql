CREATE TABLE workflow_jobs (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('RECONCILE_CASE')),
  case_id uuid NOT NULL REFERENCES cases(id),
  expected_version integer NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','RUNNING','DONE','FAILED')) DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  run_at timestamptz NOT NULL DEFAULT now(),
  leased_until timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, case_id, expected_version)
);

CREATE INDEX workflow_jobs_claim ON workflow_jobs (run_at, created_at)
WHERE status IN ('PENDING','RUNNING');
