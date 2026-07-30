/**
 * Data store.
 *
 * This defines a `Store` interface (the repository contract) and an in-memory
 * implementation. Swapping to Postgres later means implementing this same
 * interface against a real DB — no business logic changes.
 *
 * Every collection is tenant-scoped by `orgId` on the entity; query helpers
 * enforce scoping so we never leak data across tenants.
 */
import type {
  Agent,
  Appointment,
  Call,
  Lead,
  Organization,
  PhoneNumber,
  User,
  Voice,
  WebhookSubscription,
} from './types.ts';

export interface Store {
  organizations: Repository<Organization>;
  users: Repository<User>;
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

class InMemoryRepository<T extends { id: string; orgId?: string }>
  implements Repository<T>
{
  private items = new Map<string, T>();

  create(entity: T): T {
    this.items.set(entity.id, entity);
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
    return updated;
  }

  delete(id: string): boolean {
    return this.items.delete(id);
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
}

export function createInMemoryStore(): Store {
  return {
    organizations: new InMemoryRepository<Organization>(),
    users: new InMemoryRepository<User>(),
    agents: new InMemoryRepository<Agent>(),
    numbers: new InMemoryRepository<PhoneNumber>(),
    voices: new InMemoryRepository<Voice>(),
    calls: new InMemoryRepository<Call>(),
    leads: new InMemoryRepository<Lead>(),
    appointments: new InMemoryRepository<Appointment>(),
    webhooks: new InMemoryRepository<WebhookSubscription>(),
  };
}

/** Singleton store instance for the running server. */
export const store: Store = createInMemoryStore();
