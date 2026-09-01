-- Postgres document-table equivalent of the SQLite store (src/core/sqliteStore.ts).
-- Apply this when moving off a single-node SQLite file onto hosted Postgres.
-- Business logic does not change; wire a Store implementation that talks to this table.

CREATE TABLE IF NOT EXISTS voxdesk (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  org_id TEXT,
  data JSONB NOT NULL,
  PRIMARY KEY (collection, id)
);

CREATE INDEX IF NOT EXISTS voxdesk_org ON voxdesk (collection, org_id);
