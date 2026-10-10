CREATE TABLE reconciliations (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES cases(id),
  po_id uuid NOT NULL,
  po_version integer NOT NULL,
  invoice_id uuid NOT NULL,
  invoice_version integer NOT NULL,
  rules_version text NOT NULL DEFAULT 'header-v1',
  status text NOT NULL CHECK (status IN ('MATCHED', 'MISMATCHED')),
  differences jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (po_id, po_version, invoice_id, invoice_version, rules_version)
);

CREATE INDEX reconciliations_case ON reconciliations (case_id, created_at DESC);
