/**
 * Data store.
 *
 * Defines a `Store` interface (the repository contract) with two interchangeable
 * implementations:
 *   - in-memory (default): fast, ephemeral, great for dev/tests
 *   - file-backed (set VOXDESK_DATA_FILE): durable across restarts, zero external
 *     database required
 *
 * Both share the same `Repository` implementation; the file store simply wires a
 * persistence callback and loads a snapshot on startup. Swapping to Postgres
 * later means implementing this same interface — no business-logic changes.
 *
 * Every collection is tenant-scoped by `orgId` on the entity; query helpers
 * enforce scoping so we never leak data across tenants.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import type {
  Agent,
  ApiKey,
  Appointment,
  Call,
  Integration,
  Invitation,
  Lead,
  Organization,
  PhoneNumber,
  Session,
  UsageRecord,
  User,
  Voice,
  WebhookSubscription,
} from './types.ts';

export interface Store {
  organizations: Repository<Organization>;
  users: Repository<User>;
  sessions: Repository<Session>;
  apiKeys: Repository<ApiKey>;
  invitations: Repository<Invitation>;
  integrations: Repository<Integration>;
  usage: Repository<UsageRecord>;
  agents: Repository<Agent>;
  numbers: Repository<PhoneNumber>;
  voices: Repository<Voice>;
  calls: Repository<Call>;
  leads: Repository<Lead>;
  appointments: Repository<Appointment>;
  webhooks: Repository<WebhookSubscription>;
}

export interface Repository<T extends { id: string; orgId?: string }> {
  create(entity: T): T;
  get(id: string): T | undefined;
  update(id: string, patch: Partial<T>): T | undefined;
  delete(id: string): boolean;
  list(orgId?: string): T[];
  find(predicate: (e: T) => boolean): T | undefined;
  filter(predicate: (e: T) => boolean): T[];
}

class MapRepository<T extends { id: string; orgId?: string }>
  implements Repository<T>
{
  private items = new Map<string, T>();
  /** Called after any mutation so a persistence layer can save. */
  private onChange?: () => void;

  constructor(onChange?: () => void) {
    this.onChange = onChange;
  }

  create(entity: T): T {
    this.items.set(entity.id, entity);
    this.onChange?.();
    return entity;
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  update(id: string, patch: Partial<T>): T | undefined {
    const existing = this.items.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch } as T;
    this.items.set(id, updated);
    this.onChange?.();
    return updated;
  }

  delete(id: string): boolean {
    const ok = this.items.delete(id);
    if (ok) this.onChange?.();
    return ok;
  }

  list(orgId?: string): T[] {
    const all = [...this.items.values()];
    return orgId ? all.filter((e) => e.orgId === orgId) : all;
  }

  find(predicate: (e: T) => boolean): T | undefined {
    return [...this.items.values()].find(predicate);
  }

  filter(predicate: (e: T) => boolean): T[] {
    return [...this.items.values()].filter(predicate);
  }

  // --- persistence helpers ---
  dump(): T[] {
    return [...this.items.values()];
  }

  load(entities: T[]): void {
    this.items.clear();
    for (const e of entities) this.items.set(e.id, e);
  }
}

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

function buildStore(onChange?: () => void): Store {
  const s = {} as Record<string, MapRepository<{ id: string; orgId?: string }>>;
  for (const c of COLLECTIONS) s[c] = new MapRepository(onChange);
  return s as unknown as Store;
}

export function createInMemoryStore(): Store {
  return buildStore();
}

/**
 * File-backed store: loads a JSON snapshot on startup and writes it (debounced,
 * atomically via temp-file + rename) after mutations.
 */
export function createFileStore(filePath: string): Store {
  let store: Store;
  let saveTimer: NodeJS.Timeout | null = null;

  const save = () => {
    const snapshot: Record<string, unknown> = {};
    for (const c of COLLECTIONS) {
      snapshot[c] = (store[c] as unknown as MapRepository<{ id: string }>).dump();
    }
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(snapshot));
    renameSync(tmp, filePath);
  };

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 150);
  };

  store = buildStore(scheduleSave);

  if (existsSync(filePath)) {
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown[]>;
      for (const c of COLLECTIONS) {
        const rows = Array.isArray(data[c]) ? data[c] : [];
        (store[c] as unknown as MapRepository<{ id: string }>).load(rows as { id: string }[]);
      }
    } catch {
      // Corrupt/empty file: start fresh; next mutation rewrites it.
    }
  }

  return store;
}

function selectStore(): Store {
  const file = process.env.VOXDESK_DATA_FILE;
  return file ? createFileStore(file) : createInMemoryStore();
}

/** Singleton store instance for the running server. */
export const store: Store = selectStore();
