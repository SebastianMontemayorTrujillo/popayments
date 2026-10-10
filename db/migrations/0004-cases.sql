CREATE TABLE cases (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  po_id uuid REFERENCES documents(id),
  po_version integer,
  invoice_id uuid REFERENCES documents(id),
  invoice_version integer,
  status text NOT NULL DEFAULT 'WAITING_PO_AUTH',
  created_by uuid NOT NULL REFERENCES demo_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cases_updated ON cases (updated_at DESC);
