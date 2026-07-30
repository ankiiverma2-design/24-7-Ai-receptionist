/**
 * Agent service: creation (including from templates), versioning, publish.
 * Keeps route handlers thin and centralizes agent lifecycle rules.
 */
import { store } from '../core/store.ts';
import { newId, nowIso } from '../core/ids.ts';
import type { Agent, AgentDefinition } from '../core/types.ts';
import { getTemplate } from './templates.ts';

export function createAgent(
  orgId: string,
  input: { name: string; templateId?: string; voiceId?: string; definition: AgentDefinition },
): Agent {
  const agent: Agent = {
    id: newId('agt'),
    orgId,
    name: input.name,
    templateId: input.templateId,
    version: 1,
    status: 'draft',
    voiceId: input.voiceId,
    definition: input.definition,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return store.agents.create(agent);
}

/** Create an agent pre-filled from an industry template. */
export function createAgentFromTemplate(
  orgId: string,
  templateId: string,
  name?: string,
): Agent | null {
  const template = getTemplate(templateId);
  if (!template) return null;
  return createAgent(orgId, {
    name: name ?? template.name,
    templateId,
    // Deep clone so edits to the agent don't mutate the shared template.
    definition: structuredClone(template.definition),
  });
}

/** Update an agent; bumps version when the definition changes. */
export function updateAgent(
  id: string,
  patch: Partial<Pick<Agent, 'name' | 'voiceId' | 'status' | 'definition'>>,
): Agent | undefined {
  const existing = store.agents.get(id);
  if (!existing) return undefined;
  const versionBump = patch.definition ? existing.version + 1 : existing.version;
  return store.agents.update(id, {
    ...patch,
    version: versionBump,
    updatedAt: nowIso(),
  });
}

export function publishAgent(id: string): Agent | undefined {
  return store.agents.update(id, { status: 'live', updatedAt: nowIso() });
}
