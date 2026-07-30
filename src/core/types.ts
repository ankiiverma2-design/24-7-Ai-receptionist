/**
 * Core domain types for the VoxDesk platform.
 *
 * These types are the contract shared across the API, the voice orchestrator,
 * the skills, and the provider adapters. They are deliberately storage-agnostic
 * so the in-memory store can later be swapped for Postgres without touching
 * business logic.
 */

export type ID = string;
export type ISODateTime = string;

/** A customer account on the platform (multi-tenancy root). */
export interface Organization {
  id: ID;
  name: string;
  createdAt: ISODateTime;
  /** Simple plan flag; billing/metering lives on top of this later. */
  plan: 'trial' | 'starter' | 'pro' | 'scale';
}

export type Role = 'owner' | 'admin' | 'member';

export interface User {
  id: ID;
  orgId: ID;
  email: string;
  name?: string;
  role: Role;
  /** scrypt hash "salt:hash" (hex). Absent for invited-but-not-activated users. */
  passwordHash?: string;
  createdAt: ISODateTime;
}

/** A browser/API login session (bearer token). Only the token hash is stored. */
export interface Session {
  id: ID;
  orgId: ID;
  userId: ID;
  tokenHash: string;
  expiresAt: ISODateTime;
  createdAt: ISODateTime;
}

/** A programmatic API key. Only a hash + a display prefix are stored. */
export interface ApiKey {
  id: ID;
  orgId: ID;
  name: string;
  prefix: string;
  tokenHash: string;
  scopes: string[];
  lastUsedAt?: ISODateTime;
  createdAt: ISODateTime;
  revokedAt?: ISODateTime;
}

/** An invitation for a user to join an organization. */
export interface Invitation {
  id: ID;
  orgId: ID;
  email: string;
  role: Role;
  tokenHash: string;
  acceptedAt?: ISODateTime;
  expiresAt: ISODateTime;
  createdAt: ISODateTime;
}

/** A connected third-party integration (calendar, CRM, etc.) for an org. */
export interface Integration {
  id: ID;
  orgId: ID;
  type: 'google_calendar' | 'outlook_calendar' | 'calcom' | 'hubspot';
  /** Provider-specific config/credentials (e.g. refreshToken, calendarId). */
  config: Record<string, string>;
  /** Optional: scope this integration to a single agent. */
  agentId?: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** A metered usage record (e.g. call minutes) for billing. */
export interface UsageRecord {
  id: ID;
  orgId: ID;
  /** Billing period key, e.g. "2026-07". */
  period: string;
  kind: 'call_minutes' | 'outbound_minutes' | 'voice_clone' | 'number';
  quantity: number;
  callId?: ID;
  createdAt: ISODateTime;
}

/** Direction of a phone call. */
export type CallDirection = 'inbound' | 'outbound';

/** Outcome classification set once a call ends. */
export type CallOutcome =
  | 'booked'
  | 'qualified'
  | 'answered_faq'
  | 'transferred'
  | 'voicemail'
  | 'no_action'
  | 'failed';

/** A phone number provisioned to a tenant and attached to an agent. */
export interface PhoneNumber {
  id: ID;
  orgId: ID;
  e164: string;
  country: string;
  type: 'local' | 'tollfree';
  agentId?: ID;
  provider: string;
  providerRef?: string;
  createdAt: ISODateTime;
}

/** A voice used by an agent (stock or cloned). */
export interface Voice {
  id: ID;
  orgId: ID;
  name: string;
  type: 'stock' | 'cloned';
  provider: string;
  providerVoiceId: string;
  /** For cloned voices: consent must be captured before it becomes usable. */
  consent?: VoiceConsent;
  createdAt: ISODateTime;
}

export interface VoiceConsent {
  granted: boolean;
  grantedBy: string;
  method: 'recorded' | 'signed' | 'checkbox';
  capturedAt: ISODateTime;
}

/**
 * The versioned agent definition. This is the schema a no-code builder edits
 * and the voice orchestrator executes. See agents/schema.ts for validation.
 */
export interface AgentDefinition {
  /** Persona / system behavior for the LLM. */
  persona: string;
  greeting: string;
  /** Ordered qualifying questions for lead qualification. */
  qualifyingQuestions: string[];
  /** FAQ / knowledge-base entries the agent can ground answers in. */
  knowledgeBase: KnowledgeEntry[];
  /** Booking behavior. */
  booking: BookingConfig;
  /** Routing/transfer/escalation rules. */
  routing: RoutingConfig;
  /** Languages this agent may speak (BCP-47 codes). First is default. */
  languages: string[];
  /** Optional freeform flow nodes for the visual builder (advanced). */
  flow?: FlowNode[];
}

export interface KnowledgeEntry {
  question: string;
  answer: string;
}

export interface BookingConfig {
  enabled: boolean;
  /** Which calendar integration to use. */
  provider: 'none' | 'google' | 'outlook' | 'calcom' | 'in_memory';
  /** Service types the caller can book. */
  services: string[];
  timezone: string;
  /** Minutes per slot. */
  slotMinutes: number;
}

export interface RoutingConfig {
  /** If true, agent may transfer to a human. */
  transferEnabled: boolean;
  /** E.164 number to transfer to. */
  transferNumber?: string;
  /** Natural-language condition describing when to escalate. */
  escalateWhen?: string;
  businessHours?: BusinessHours;
  afterHoursBehavior: 'voicemail' | 'book' | 'message';
}

export interface BusinessHours {
  timezone: string;
  /** 0=Sun..6=Sat -> [openHHmm, closeHHmm] or null if closed. */
  days: Record<number, [string, string] | null>;
}

export interface FlowNode {
  id: string;
  type: 'say' | 'collect' | 'branch' | 'action';
  config: Record<string, unknown>;
  next?: string;
}

/** A configured AI receptionist. Versioned via `version`. */
export interface Agent {
  id: ID;
  orgId: ID;
  name: string;
  /** Industry template this agent was created from. */
  templateId?: string;
  version: number;
  status: 'draft' | 'live';
  voiceId?: ID;
  definition: AgentDefinition;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** A phone call handled (or being handled) by an agent. */
export interface Call {
  id: ID;
  orgId: ID;
  agentId: ID;
  numberId?: ID;
  direction: CallDirection;
  from: string;
  to: string;
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  durationSec?: number;
  language?: string;
  outcome?: CallOutcome;
  transcript: TranscriptTurn[];
  capturedFields: Record<string, string>;
  recordingUrl?: string;
  cost?: number;
  provider: string;
  providerRef?: string;
  /** Post-call intelligence (filled asynchronously after the call ends). */
  summary?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface TranscriptTurn {
  role: 'agent' | 'caller' | 'system';
  text: string;
  at: ISODateTime;
}

/** A lead / contact captured from a call. */
export interface Lead {
  id: ID;
  orgId: ID;
  callId?: ID;
  name?: string;
  phone?: string;
  email?: string;
  intent?: string;
  service?: string;
  score?: number;
  tags: string[];
  attributes: Record<string, string>;
  createdAt: ISODateTime;
}

/** An appointment booked during a call. */
export interface Appointment {
  id: ID;
  orgId: ID;
  callId?: ID;
  leadId?: ID;
  service: string;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  status: 'booked' | 'rescheduled' | 'cancelled';
  timezone: string;
  createdAt: ISODateTime;
}

/** An outbound webhook subscription. */
export interface WebhookSubscription {
  id: ID;
  orgId: ID;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: ISODateTime;
}

/** Lifecycle events emitted onto the event bus. */
export type PlatformEventType =
  | 'call.started'
  | 'call.completed'
  | 'lead.qualified'
  | 'appointment.booked'
  | 'call.transferred'
  | 'voicemail.left';

export interface PlatformEvent<T = unknown> {
  id: ID;
  orgId: ID;
  type: PlatformEventType;
  payload: T;
  at: ISODateTime;
}
