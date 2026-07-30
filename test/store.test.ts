import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { createInMemoryStore, createFileStore } from '../src/core/store.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('in-memory store scopes list() by orgId', () => {
  const s = createInMemoryStore();
  s.agents.create({ id: 'a1', orgId: 'o1' } as any);
  s.agents.create({ id: 'a2', orgId: 'o2' } as any);
  s.agents.create({ id: 'a3', orgId: 'o1' } as any);
  assert.equal(s.agents.list('o1').length, 2);
  assert.equal(s.agents.list('o2').length, 1);
  assert.equal(s.agents.list().length, 3);
});

test('update merges and delete removes', () => {
  const s = createInMemoryStore();
  s.leads.create({ id: 'l1', orgId: 'o1', tags: [], attributes: {} } as any);
  const updated = s.leads.update('l1', { name: 'Jane' } as any);
  assert.equal((updated as any).name, 'Jane');
  assert.equal(s.leads.delete('l1'), true);
  assert.equal(s.leads.get('l1'), undefined);
});

test('file store persists across reopen (durability)', async () => {
  const file = join(tmpdir(), `voxdesk-test-${Date.now()}.json`);
  try {
    const s1 = createFileStore(file);
    s1.organizations.create({ id: 'org_x', name: 'X', plan: 'pro', createdAt: 'now' } as any);
    s1.agents.create({ id: 'agt_x', orgId: 'org_x', name: 'A' } as any);
    await sleep(250); // allow the debounced atomic save to flush

    const s2 = createFileStore(file);
    assert.equal(s2.organizations.get('org_x')?.name, 'X');
    assert.equal(s2.agents.list('org_x').length, 1);
  } finally {
    rmSync(file, { force: true });
    rmSync(`${file}.tmp`, { force: true });
  }
});
