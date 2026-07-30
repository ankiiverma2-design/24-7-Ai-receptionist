/**
 * Validation for the agent definition (zero-dependency).
 *
 * This is the contract between the no-code builder (frontend) and the platform.
 * The builder produces JSON matching AgentDefinition; the API validates it on
 * create/update; the orchestrator executes it. Validation here is what keeps
 * "config as data" safe.
 */
import {
  err,
  isBoolean,
  isNonEmptyString,
  isNumber,
  isObject,
  isString,
  isStringArray,
  ok,
  oneOf,
  type Result,
} from '../core/validate.ts';
import { isSupportedLanguage } from '../i18n/languages.ts';
import type {
  AgentDefinition,
  BookingConfig,
  KnowledgeEntry,
  RoutingConfig,
} from '../core/types.ts';

const BOOKING_PROVIDERS = ['none', 'google', 'outlook', 'calcom', 'in_memory'] as const;
const AFTER_HOURS = ['voicemail', 'book', 'message'] as const;

function validateBooking(v: unknown, path: string): Result<BookingConfig> {
  if (!isObject(v)) return err(`${path} must be an object`);
  if (!isBoolean(v.enabled)) return err(`${path}.enabled must be boolean`);
  if (!oneOf(v.provider, BOOKING_PROVIDERS))
    return err(`${path}.provider must be one of ${BOOKING_PROVIDERS.join(', ')}`);
  const services = v.services ?? [];
  if (!isStringArray(services)) return err(`${path}.services must be string[]`);
  const timezone = v.timezone ?? 'UTC';
  if (!isString(timezone)) return err(`${path}.timezone must be a string`);
  const slotMinutes = v.slotMinutes ?? 30;
  if (!isNumber(slotMinutes) || slotMinutes <= 0)
    return err(`${path}.slotMinutes must be a positive number`);
  return ok({
    enabled: v.enabled,
    provider: v.provider,
    services,
    timezone,
    slotMinutes,
  });
}

function validateRouting(v: unknown, path: string): Result<RoutingConfig> {
  if (!isObject(v)) return err(`${path} must be an object`);
  const transferEnabled = v.transferEnabled ?? false;
  if (!isBoolean(transferEnabled)) return err(`${path}.transferEnabled must be boolean`);
  if (v.transferNumber !== undefined && !isString(v.transferNumber))
    return err(`${path}.transferNumber must be a string`);
  if (v.escalateWhen !== undefined && !isString(v.escalateWhen))
    return err(`${path}.escalateWhen must be a string`);
  const afterHoursBehavior = v.afterHoursBehavior ?? 'voicemail';
  if (!oneOf(afterHoursBehavior, AFTER_HOURS))
    return err(`${path}.afterHoursBehavior must be one of ${AFTER_HOURS.join(', ')}`);
  return ok({
    transferEnabled,
    transferNumber: v.transferNumber as string | undefined,
    escalateWhen: v.escalateWhen as string | undefined,
    businessHours: v.businessHours as RoutingConfig['businessHours'],
    afterHoursBehavior,
  });
}

function validateKnowledge(v: unknown, path: string): Result<KnowledgeEntry[]> {
  const arr = v ?? [];
  if (!Array.isArray(arr)) return err(`${path} must be an array`);
  const out: KnowledgeEntry[] = [];
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (!isObject(e) || !isNonEmptyString(e.question) || !isNonEmptyString(e.answer))
      return err(`${path}[${i}] must have non-empty question and answer`);
    out.push({ question: e.question, answer: e.answer });
  }
  return out.length || Array.isArray(arr) ? ok(out) : ok([]);
}

export function validateAgentDefinition(v: unknown): Result<AgentDefinition> {
  if (!isObject(v)) return err('definition must be an object');

  if (!isNonEmptyString(v.persona)) return err('definition.persona is required');
  if (!isNonEmptyString(v.greeting)) return err('definition.greeting is required');

  const qualifyingQuestions = v.qualifyingQuestions ?? [];
  if (!isStringArray(qualifyingQuestions))
    return err('definition.qualifyingQuestions must be string[]');

  const kb = validateKnowledge(v.knowledgeBase, 'definition.knowledgeBase');
  if (!kb.ok) return kb;

  const booking = validateBooking(v.booking, 'definition.booking');
  if (!booking.ok) return booking;

  const routing = validateRouting(v.routing, 'definition.routing');
  if (!routing.ok) return routing;

  if (!isStringArray(v.languages) || v.languages.length === 0)
    return err('definition.languages must be a non-empty string[]');
  const bad = v.languages.filter((c) => !isSupportedLanguage(c));
  if (bad.length) return err(`Unsupported language code(s): ${bad.join(', ')}`);

  return ok({
    persona: v.persona,
    greeting: v.greeting,
    qualifyingQuestions,
    knowledgeBase: kb.value,
    booking: booking.value,
    routing: routing.value,
    languages: v.languages,
    flow: Array.isArray(v.flow) ? (v.flow as AgentDefinition['flow']) : undefined,
  });
}

export interface CreateAgentInput {
  name: string;
  templateId?: string;
  voiceId?: string;
  definition: AgentDefinition;
}

export function validateCreateAgent(v: unknown): Result<CreateAgentInput> {
  if (!isObject(v)) return err('body must be an object');
  if (!isNonEmptyString(v.name)) return err('name is required');
  const def = validateAgentDefinition(v.definition);
  if (!def.ok) return def;
  return ok({
    name: v.name,
    templateId: isString(v.templateId) ? v.templateId : undefined,
    voiceId: isString(v.voiceId) ? v.voiceId : undefined,
    definition: def.value,
  });
}

export interface UpdateAgentInput {
  name?: string;
  voiceId?: string;
  status?: 'draft' | 'live';
  definition?: AgentDefinition;
}

export function validateUpdateAgent(v: unknown): Result<UpdateAgentInput> {
  if (!isObject(v)) return err('body must be an object');
  const out: UpdateAgentInput = {};
  if (v.name !== undefined) {
    if (!isNonEmptyString(v.name)) return err('name must be a non-empty string');
    out.name = v.name;
  }
  if (v.voiceId !== undefined) {
    if (!isString(v.voiceId)) return err('voiceId must be a string');
    out.voiceId = v.voiceId;
  }
  if (v.status !== undefined) {
    if (!oneOf(v.status, ['draft', 'live'] as const))
      return err('status must be draft or live');
    out.status = v.status;
  }
  if (v.definition !== undefined) {
    const def = validateAgentDefinition(v.definition);
    if (!def.ok) return def;
    out.definition = def.value;
  }
  return ok(out);
}
