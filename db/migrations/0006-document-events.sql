CREATE TABLE document_events (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES documents(id),
  version integer NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('CREATED', 'VERSION_ADDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  UNIQUE (document_id, version, event_type)
);
