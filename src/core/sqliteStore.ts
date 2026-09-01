/**
 * SQLite-backed Store (node:sqlite, zero npm deps).
 *
 * All collections live in one JSON document table so the repository contract
 * stays identical to the in-memory/file stores. Set VOXDESK_SQLITE_FILE to use.
 * A Postgres-shaped schema lives in src/db/schema.sql for a later hosted DB.
 */
import { DatabaseSync } from 'node:sqlite';
import type { Store } from './store.ts';

const COLLECTIONS = [
  'organizations',
  'users',
  'sessions',
  'apiKeys',
  'invitations',
  'integrations',
  'usage',
  'agents',
  'numbers',
  'voices',
  'calls',
  'leads',
  'appointments',
  'webhooks',
] as const;

type Row = { id: string; orgId?: string };

class SqliteRepository<T extends Row> {
  private db: DatabaseSync;
  private collection: string;

  constructor(db: DatabaseSync, collection: string) {
    this.db = db;
    this.collection = collection;
  }

  create(entity: T): T {
    this.db
      .prepare(
        'INSERT INTO voxdesk (collection, id, org_id, data) VALUES (?, ?, ?, ?)',
      )
      .run(this.collection, entity.id, entity.orgId ?? null, JSON.stringify(entity));
    return entity;
  }

  get(id: string): T | undefined {
    const row = this.db
      .prepare('SELECT data FROM voxdesk WHERE collection = ? AND id = ?')
      .get(this.collection, id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }

  update(id: string, patch: Partial<T>): T | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch } as T;
    this.db
      .prepare('UPDATE voxdesk SET org_id = ?, data = ? WHERE collection = ? AND id = ?')
      .run(updated.orgId ?? null, JSON.stringify(updated), this.collection, id);
    return updated;
  }

  delete(id: string): boolean {
    const res = this.db
      .prepare('DELETE FROM voxdesk WHERE collection = ? AND id = ?')
      .run(this.collection, id);
    return Number(res.changes) > 0;
  }

  list(orgId?: string): T[] {
    if (orgId) {
      const rows = this.db
        .prepare('SELECT data FROM voxdesk WHERE collection = ? AND org_id = ?')
        .all(this.collection, orgId) as Array<{ data: string }>;
      return rows.map((r) => JSON.parse(r.data) as T);
    }
    const rows = this.db
      .prepare('SELECT data FROM voxdesk WHERE collection = ?')
      .all(this.collection) as Array<{ data: string }>;
    return rows.map((r) => JSON.parse(r.data) as T);
  }

  find(predicate: (e: T) => boolean): T | undefined {
    return this.list().find(predicate);
  }

  filter(predicate: (e: T) => boolean): T[] {
    return this.list().filter(predicate);
  }
}

export function createSqliteStore(filePath: string): Store {
  const db = new DatabaseSync(filePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS voxdesk (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      org_id TEXT,
      data TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS voxdesk_org ON voxdesk(collection, org_id);
  `);
  const store = {} as Record<string, SqliteRepository<Row>>;
  for (const c of COLLECTIONS) store[c] = new SqliteRepository(db, c);
  return store as unknown as Store;
}
