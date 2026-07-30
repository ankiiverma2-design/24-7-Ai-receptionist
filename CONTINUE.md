# Continue Here — Developer Handoff Guide

This guide lets you pick up the project on **another platform** (your laptop, a
cloud IDE, CI, or another AI coding tool) and keep building. It covers the current
status, how to run and deploy the app anywhere, and the remaining engineering work
mapped directly to the code.

For the full end-to-end runbook (bootstrap → first live call → production launch),
see **[NEXT_STEPS.md](NEXT_STEPS.md)**. This document is the shorter "clone it and
continue" handoff.

---

## 1. Current status

**Implemented, tested, and on `main`:**

- Real-time voice loop: Twilio Media Streams ↔ OpenAI Realtime, with barge-in
- Tools: FAQ lookup, lead capture, appointment booking, human escalation
- 22 industry templates, 58 languages, validated agent-definition schema
- Multi-tenant auth: signup/login/sessions, scoped API keys, invitations, roles
- Durable file-backed store (survives restarts); same interface swaps to Postgres
- Twilio webhook signature validation
- Billing: plan tiers, usage metering, plan-limit enforcement
- Post-call worker: minute metering + LLM summary/sentiment
- Analytics + usage API, browser dashboard
- **33 automated tests, all passing**
- Deployment: Dockerfile, render.yaml, GitHub Actions CI

**Recently added:** Google Calendar integration (OAuth + real free/busy + event
creation) behind a provider interface.

**Not yet built (the remaining work — see section 5):** Outlook/Cal.com calendar
adapters, CRM OAuth adapters, Stripe checkout (metering/limits exist; payment
capture does not),
vector KB retrieval, Postgres implementation, the no-code builder UI, self-hosted
LiveKit path, and deeper observability/rate limiting.

**Key property:** the app has **zero runtime dependencies** — it runs TypeScript
directly on Node via type-stripping. No `npm install`, no build step.

---

## 2. Continue on another platform

### Prerequisites
- **Node.js >= 22.6** (required for `--experimental-strip-types` and the global
  `WebSocket`). Verified on Node 22.23.
- Git. No package manager install is needed to run or test.

### Clone and run
```bash
git clone https://github.com/ankiiverma2-design/24-7-Ai-receptionist.git
cd 24-7-Ai-receptionist
cp .env.example .env      # fill in what you have; API/dashboard work without provider keys
npm start                 # http://localhost:3000/?token=<API_ADMIN_TOKEN>
```

### Run the tests
```bash
npm test                  # node --experimental-strip-types --test test/*.test.ts
```

### Editor/IDE notes
- Any editor works. For full TypeScript type-checking in your IDE, install dev
  types once (optional; not needed to run): `npm i -D @types/node typescript`,
  then `npm run typecheck`.
- The runtime deliberately needs **no** dependencies; keep it that way unless you
  are intentionally adopting a framework.

### Deploy
- **Docker:** `docker build -t voxdesk . && docker run -p 3000:3000 --env-file .env voxdesk`
- **Render:** the repo includes `render.yaml` (web service + persistent disk).
  Any host works if it supports **HTTPS + long-lived WebSockets** (required for
  Twilio Media Streams). Set secrets in the host's secret manager — never commit them.
- After deploying, set `PUBLIC_BASE_URL` to the public HTTPS origin so the
  generated Twilio media-stream `wss://` URL is correct.

---

## 3. How the code is organized (orientation)

```
src/
  index.ts            # server entry: HTTP + auth + static + WS upgrade + boot
  auth/               # passwords (scrypt), tokens, service, middleware
  billing/            # plans + usage metering + limit enforcement
  core/               # types, store (interface + in-memory + file), events, ids, validate
  providers/          # telephony (Twilio), voice (OpenAI Realtime), tts (ElevenLabs), llm router
  agents/             # templates (22), schema, service (lifecycle)
  skills/             # booking, knowledgeBase, leadCapture, routing, tools (registry+dispatch)
  voice/              # instructions builder, orchestrator (Twilio<->OpenAI bridge)
  telephony/          # voice webhook (TwiML) + Twilio signature validation
  api/                # REST routes, auth routes, analytics routes, text simulation
  workers/            # webhook delivery, post-call summary/metering
  i18n/               # 58 languages
test/                 # node:test suites (33 tests)
```

**Design rule to preserve:** external capabilities sit behind interfaces
(`providers/**/types.ts`). Add new vendors by implementing an interface, not by
reaching into business logic.

---

## 4. Suggested order to continue

1. Real calendar integration (highest product value after voice quality).
2. Stripe checkout (turn the existing metering/limits into revenue).
3. CRM sync (HubSpot first).
4. Postgres persistence (before onboarding real customer volume).
5. Vector KB retrieval (answer quality).
6. No-code builder UI (self-serve).
7. Observability + rate limiting + WS auth binding (hardening).
8. Self-hosted LiveKit path (margin/control at scale).

---

## 5. Remaining engineering work (mapped to code)

Each item lists **where** to work and the **concrete steps**. Acceptance criteria
and the phased plan live in [NEXT_STEPS.md](NEXT_STEPS.md).

### 5.1 Real calendar adapters — Google ✅ done · Outlook / Cal.com (next)
- **Done:** `CalendarProvider` interface (`src/providers/calendar/types.ts`),
  shared slot math (`slots.ts`), in-memory + **Google Calendar** adapters
  (OAuth flow, token refresh, free/busy availability, event create/cancel), a
  registry (`resolveCalendar`) that routes by `agent.definition.booking.provider`
  and falls back to in-memory, booking wired through it (only marks "booked"
  after the provider confirms), and integration API (`/api/integrations/*` +
  Google OAuth URL/callback/manual connect). Env: `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- **Next:** add Outlook and Cal.com by implementing the same `CalendarProvider`
  interface and registering them in `src/providers/calendar/index.ts`; add
  reschedule support (cancel + create today).

### 5.2 Stripe checkout + subscriptions
- **Where:** `src/billing/` (plans + usage + limits already exist). Add
  `src/providers/billing/stripe.ts` and billing routes.
- **Steps:**
  1. Map `PLANS` to Stripe products/prices.
  2. Add checkout-session creation + customer portal endpoints.
  3. Handle Stripe webhooks (`checkout.session.completed`,
     `customer.subscription.updated/deleted`) to set `Organization.plan`.
  4. Keep the existing internal limit enforcement as the source of truth.
- **Env:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

### 5.3 CRM sync (HubSpot, then others)
- **Where:** `src/workers/` (subscribe to `lead.qualified` / `appointment.booked`),
  add `src/providers/crm/`.
- **Steps:** implement a `CrmProvider` (create/update contact), OAuth, field
  mapping, idempotency, retries + dead-letter. Never block the call path.

### 5.4 Postgres persistence
- **Where:** `src/core/store.ts` — implement the `Store`/`Repository` interfaces
  against Postgres (a new `createPostgresStore`).
- **Steps:** create migrations for every entity (all are `orgId`-scoped), enforce
  tenant isolation, add backups + a tested restore. No business-logic changes
  required — just a new `Store` implementation selected in `selectStore()`.

### 5.5 Vector knowledge-base retrieval
- **Where:** `src/skills/knowledgeBase.ts` (currently lexical overlap).
- **Steps:** add document ingestion + embeddings + tenant-isolated vector search
  behind the existing `searchKnowledgeBase` signature; keep the confidence
  threshold + safe refusal so the agent never fabricates.

### 5.6 No-code builder UI
- **Where:** new frontend app consuming the existing agent API + `agents/schema.ts`.
- **Steps:** visual flow/prompt/FAQ/voice/integration editor, browser test call,
  draft → validate → publish → version rollback. The schema is already the
  source of truth; do not create a second one.

### 5.7 Hardening
- **Rate limiting:** per API key / per org (add middleware around the router).
- **WebSocket auth binding:** issue a short-lived signed token in the voice
  webhook and require it on the `/telephony/media` upgrade (don't trust raw
  `agentId`/`callId` params).
- **Observability:** structured request/call IDs, latency-per-stage metrics,
  provider error rates, alerts (see NEXT_STEPS §15).

### 5.8 Self-hosted realtime (LiveKit) — optional, for scale/margin
- **Where:** implement the `TelephonyProvider` + a voice pipeline behind the
  existing `providers/voice` interface as an alternative to the managed OpenAI
  Realtime path. Benchmark latency before switching.

---

## 6. Guardrails when continuing

- Keep secrets out of Git; use the host's secret manager.
- Preserve provider abstraction (implement interfaces, don't leak vendors).
- Add a test for each new capability (`test/`, `node:test`, zero-dep).
- CI (`.github/workflows/ci.yml`) runs tests + a boot smoke test on every PR —
  keep it green. Never add env-dumping to CI, and change CI only via PR.
- Live OpenAI/Twilio/ElevenLabs calls need real keys and a public HTTPS host;
  they can't run in a no-network sandbox.

---

## 7. Where to look next

- **[NEXT_STEPS.md](NEXT_STEPS.md)** — full phased runbook with exit criteria.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — system design + provider abstractions.
- **[docs/PRD.md](docs/PRD.md)** — product requirements and scope.
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — full-vision phasing.
- **[README.md](README.md)** — setup, API overview, project structure.
