CREATE TABLE documents (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('PO', 'INVOICE')),
  initial_supplier_id text NOT NULL,
  document_number text NOT NULL,
  current_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, initial_supplier_id, document_number)
);

CREATE TABLE document_versions (
  document_id uuid NOT NULL REFERENCES documents(id),
  version integer NOT NULL CHECK (version > 0),
  source_hash text NOT NULL,
  canonical_hash text NOT NULL,
  data jsonb NOT NULL,
  format text NOT NULL CHECK (format IN ('json', 'xml')),
  original bytea NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES demo_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, version)
);

CREATE INDEX document_versions_hash ON document_versions (source_hash);
