ALTER TABLE workflow_jobs DROP CONSTRAINT workflow_jobs_kind_check;
ALTER TABLE workflow_jobs ADD CONSTRAINT workflow_jobs_kind_check CHECK (kind IN ('RECONCILE_CASE','AGENT_RUN'));

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES cases(id),
  job_id uuid UNIQUE REFERENCES workflow_jobs(id),
  model text NOT NULL,
  status text NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED','BLOCKED_CONFIGURATION')),
  tool_calls integer NOT NULL DEFAULT 0,
  result_summary text,
  last_error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX agent_runs_case ON agent_runs (case_id,started_at DESC);

CREATE TABLE agent_tool_events (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES agent_runs(id),
  name text NOT NULL,
  arguments jsonb NOT NULL,
  result jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
