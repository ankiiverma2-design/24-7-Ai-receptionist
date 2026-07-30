# Architecture — AI Receptionist Platform (VoxDesk)

**Version:** 1.0
**Companion to:** `PRD.md`, `ROADMAP.md`
**Last updated:** 2026-07-30

This document describes the technical design for the full-vision, multi-tenant AI voice receptionist platform. It is provider-agnostic where possible: critical external capabilities (telephony, STT, TTS, LLM) sit behind internal interfaces so vendors can be swapped or run in failover.

---

## 1. Architecture principles

1. **Provider abstraction.** No business logic depends directly on a single vendor. STT/TTS/LLM/telephony are pluggable adapters.
2. **Latency is a feature.** Everything in the voice path is streaming and colocated in-region.
3. **Stateless services, stateful stores.** Horizontal scale for compute; durable state in managed data stores.
4. **Multi-tenant by default.** Every row, event, and log is tenant-scoped.
5. **Event-driven side effects.** CRM sync, webhooks, notifications, and analytics run off an event bus, never blocking the call.
6. **Config as data.** Agents (persona, flow, voice, integrations) are versioned data, not code.

---

## 2. High-level system diagram

```
                        ┌─────────────────────────────────────────────┐
   PSTN / Caller ─────► │            Telephony / Media Layer            │
                        │   (Twilio + LiveKit media  OR  managed voice) │
                        └───────────────┬───────────────────────────────┘
                                        │ audio (streaming, bidirectional)
                                        ▼
                        ┌─────────────────────────────────────────────┐
                        │             Voice Orchestrator               │
                        │  turn-taking · barge-in · session state       │
                        │  ┌─────────┐   ┌──────────┐   ┌─────────────┐ │
                        │  │  STT    │──►│   LLM     │──►│    TTS      │ │
                        │  │ adapter │   │  router   │   │  adapter    │ │
                        │  └─────────┘   └────┬─────┘   └─────────────┘ │
                        └─────────────────────┼─────────────────────────┘
                                              │ tool calls (function calling)
                                              ▼
                        ┌─────────────────────────────────────────────┐
                        │              Skills / Tools API               │
                        │  booking · KB retrieval · CRM · routing · SMS │
                        └───────────────┬───────────────────────────────┘
                                        │ emits events
                                        ▼
   Dashboard / No-code   ┌──────────────────────────┐    ┌──────────────┐
   Builder / Public API ─┤   Core Platform (API)     ├───►│  Event Bus   │
                         │  auth · tenants · agents  │    │ (queue/topic)│
                         │  numbers · billing · logs │    └──────┬───────┘
                         └──────────┬────────────────┘           │
                                    │                             ▼
                        ┌───────────┴───────────┐     ┌────────────────────────┐
                        │  Postgres · Redis ·    │     │  Async Workers          │
                        │  Object store · Vector │     │  CRM sync · webhooks ·  │
                        │  DB · Analytics store  │     │  transcription · reports│
                        └────────────────────────┘     └────────────────────────┘
```

---

## 3. Component breakdown

### 3.1 Telephony / media layer
- **Responsibilities:** call setup/teardown, PSTN connectivity, number provisioning, media streaming (RTP/WebRTC), DTMF, transfer, recording.
- **Options:**
  - **Managed voice** (Vapi/Retell/Bland): fastest to market; provider owns the realtime loop.
  - **Self-hosted realtime** (LiveKit Agents + Twilio Programmable Voice / SIP trunks): more control, better margins at scale, harder to build.
- **Design:** a `TelephonyProvider` interface (`provisionNumber`, `startCall`, `bridgeTransfer`, `hangup`, media stream hooks). Start managed, keep the interface so we can migrate to LiveKit without touching orchestration logic.

### 3.2 Voice orchestrator (the realtime core)
- Manages a single call session: audio in → STT (streaming, partial results) → dialogue manager → LLM → TTS (streaming) → audio out.
- **Turn-taking & barge-in:** VAD (voice activity detection) + endpointing; when the caller speaks over the agent, cut TTS and reprocess.
- **Latency budget (target p50 < 800 ms):** STT partial ~100–200 ms, LLM first token ~200–400 ms, TTS first audio ~100–200 ms, network/jitter buffer the rest. Use streaming at every hop; never wait for full transcripts or full completions.
- **Dialogue manager:** merges the agent's flow config (from the builder) with the LLM. Handles state, slot filling, tool invocation, guardrails, and escalation.
- **Session state** kept in Redis for the call's lifetime; final artifacts persisted to Postgres/object store on completion.

### 3.3 Model routing & adapters
- **STT adapter:** streaming transcription with language detection (e.g., Deepgram, Whisper-based). Per-language model selection.
- **LLM router:** chooses model per tenant/plan/task (fast model for simple turns, stronger model for complex reasoning); handles function/tool calling, retries, and failover across providers.
- **TTS adapter:** streaming synthesis; stock voices + cloned voices; per-language voice mapping.
- All three implement a common `capabilities()` + health-check contract; a circuit breaker fails over to a secondary provider.

### 3.4 Skills / tools API
Callable by the LLM via function calling. Each skill is idempotent and tenant-scoped:
- **Booking:** availability lookup + create/reschedule/cancel across calendar providers.
- **KB retrieval:** vector search over the tenant knowledge base with grounding.
- **CRM / contacts:** create/update leads.
- **Routing/transfer:** evaluate rules, initiate warm/cold transfer, voicemail.
- **Messaging:** send SMS/email confirmations.
- **Data capture:** structured extraction of caller fields.

### 3.5 Core platform API
- Auth (org/workspace/roles), tenant management, agent CRUD + versioning, number management, integration credential vault, billing, analytics read APIs, public API + webhook subscription management.
- Enforces authz, rate limits, and audit logging.

### 3.6 No-code agent builder (frontend)
- Visual flow editor (nodes = steps/branches/actions), prompt editor with variables, KB linking, voice picker/cloning UI, integration config, browser test-call sandbox, publish/rollback.
- Compiles the visual config into the versioned **agent definition** consumed by the dialogue manager.

### 3.7 Event bus & async workers
- Call lifecycle events (`call.started`, `call.completed`, `lead.qualified`, `appointment.booked`, `call.transferred`, `voicemail.left`) published to a queue/topic.
- Workers handle: CRM/Sheets sync, outbound webhooks (signed, retried, DLQ), post-call transcription/summarization/sentiment, recording storage, analytics rollups, scheduled reports.
- Keeps the call path free of slow third-party I/O.

---

## 4. Data model (core entities)

- **Organization** → has **Workspaces** → has **Users** (roles).
- **Agent** (versioned): persona/prompt, flow definition, language config, voice ref, KB refs, integration refs, routing rules.
- **PhoneNumber**: provider ref, country/type, assigned agent.
- **Call**: tenant, agent, number, direction, timestamps, transcript ref, recording ref, outcome, captured fields, cost, language(s), sentiment.
- **Contact / Lead**: identity, captured attributes, score/tags, source call.
- **Appointment**: calendar ref, contact, time, status.
- **KnowledgeBase / Document / Chunk** (+ vector embeddings).
- **Integration**: type, encrypted credentials, config.
- **Voice**: type (stock/cloned), consent record ref, provider voice id.
- **WebhookSubscription**, **ApiKey**, **UsageRecord**, **Subscription/Plan**, **AuditLog**.

**Stores:**
- **Postgres** — primary relational store (tenant-scoped, row-level isolation).
- **Redis** — session state, caches, rate limits.
- **Vector DB** — KB embeddings (pgvector or dedicated).
- **Object storage** — recordings, transcripts, uploaded docs, voice samples.
- **Analytics store** — columnar/warehouse for dashboards and rollups.

---

## 5. Multi-tenancy & isolation
- Single logical database with **tenant_id on every row** + enforced query scoping (and row-level security where supported).
- Per-tenant encryption of integration secrets in a vault/KMS.
- Per-tenant rate limits and usage metering.
- Optional dedicated resources / data residency for enterprise (roadmap).

---

## 6. Security, privacy & compliance
- TLS everywhere; encryption at rest for DB, object store, and secrets (KMS).
- Least-privilege IAM; scoped API keys; signed webhooks (HMAC).
- **Recording consent** configurable per region; consent state stored per call.
- **Voice-clone consent** captured and stored before a clone is usable.
- **Data retention** policies per tenant; deletion/export for GDPR/CCPA data-subject requests.
- **PHI/HIPAA path:** BAA-capable vendors, restricted PHI flows, access logging — gated milestone (see ROADMAP).
- Audit logs for admin and configuration actions.

---

## 7. Scalability & reliability
- **Stateless services** behind autoscaling; concurrency driven by active call sessions.
- **Regional media** to minimize round-trip latency; route calls to nearest region.
- **Provider failover** via circuit breakers for STT/TTS/LLM/telephony.
- **Backpressure & queues** for async work; DLQs for poison messages.
- **Graceful degradation:** if TTS clone fails → stock voice; if booking API down → capture details + callback promise; if LLM slow → fallback model.
- **Capacity target:** thousands of concurrent calls via horizontal scale of orchestrator workers + provider concurrency limits negotiated per region.

---

## 8. Observability
- Structured logs, distributed tracing across the voice path (span per hop: STT/LLM/TTS/tool).
- Metrics: latency per hop, WER, drop rate, containment, cost/minute, provider error rates.
- Per-tenant health and alerting; synthetic test calls as canaries.
- Call-level debug view in the dashboard (transcript + timeline + tool calls).

---

## 9. Suggested tech stack (starting point)

| Layer | Choice (proposed) | Notes |
|-------|-------------------|-------|
| Frontend (dashboard + builder) | Next.js + TypeScript, React Flow for the flow editor | |
| Backend API | Node.js (NestJS) **or** Python (FastAPI) | Pick one; team preference |
| Realtime voice | LiveKit Agents (self-host path) or managed provider (speed path) | Behind adapter |
| STT | Deepgram / Whisper | Streaming |
| TTS + cloning | ElevenLabs / Cartesia / PlayHT | Streaming |
| LLM | OpenAI / Anthropic behind a router | Model tiering |
| Telephony/numbers | Twilio | Provisioning + PSTN |
| DB | PostgreSQL (+ pgvector) | Primary + vectors |
| Cache/session | Redis | |
| Queue/bus | SQS/PubSub/Kafka or Redis streams | Start simple |
| Object storage | S3-compatible | Recordings/docs |
| Billing | Stripe | Usage-based |
| Infra | Containers on a managed platform (K8s or serverless containers) | Autoscale |
| Observability | OpenTelemetry + a metrics/tracing backend | |

> **Recommendation:** start on a **managed voice provider** to hit the "2-minute launch" and validate quality fast, while building everything behind the `TelephonyProvider`/adapter interfaces. Migrate the realtime core to **self-hosted LiveKit** once volume justifies the margin and control.

---

## 10. Key technical decisions to confirm
1. Managed voice first vs. self-hosted realtime from day one.
2. Node (NestJS) vs. Python (FastAPI) for core services.
3. Single-DB row-level isolation vs. schema-per-tenant.
4. Vector store: pgvector vs. dedicated.
5. Queue technology (managed cloud queue vs. Kafka vs. Redis streams).
