# 24/7 AI Receptionist (VoxDesk)

A 24/7 AI-powered voice receptionist for inbound and outbound calls. It answers
calls, qualifies leads, books appointments, answers FAQs, and routes callers with
natural, real-time conversation — with industry templates, multi-language support,
custom voice cloning, a public REST API, and a no-code agent model.

**Built with zero runtime dependencies** — only Node.js built-ins. No `npm install`
needed; it runs directly from TypeScript via Node's built-in type-stripping.

> **Status:** The working application foundation is now in this repository. The
> core voice loop and platform APIs are real and working. Some enterprise pieces
> are scaffolded with clear extension points (see the table below). The
> production path is documented step by step in **[NEXT_STEPS.md](NEXT_STEPS.md)**.

## Start here

- **[CONTINUE.md](CONTINUE.md)** — developer handoff: how to clone, run, deploy,
  and continue the build on another platform, with the remaining work mapped to code.
- **[NEXT_STEPS.md](NEXT_STEPS.md)** — the ordered process from the current state
  through the first live phone call and on to production readiness and launch.
- **[docs/PRD.md](docs/PRD.md)** — product requirements and scope.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — system design and provider abstractions.
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — phased plan for the full-vision platform.

---

## What works today

| Capability | Status |
|-----------|--------|
| Real-time voice loop (Twilio Media Streams ↔ OpenAI Realtime) | ✅ Implemented |
| Barge-in / interruption handling | ✅ Implemented |
| Tool calling: booking, FAQ lookup, lead capture, human escalation | ✅ Implemented |
| 20+ industry templates | ✅ 22 templates |
| 50+ languages | ✅ 58 languages |
| No-code agent definition + validation | ✅ Implemented |
| Appointment booking (in-memory calendar) | ✅ Implemented |
| FAQ knowledge base (lexical retrieval + grounding) | ✅ Implemented |
| Lead capture + scoring + qualification events | ✅ Implemented |
| Routing / business hours / after-hours behavior | ✅ Implemented |
| Instant number provisioning (Twilio) | ✅ Implemented |
| Custom voice cloning (ElevenLabs) with consent gating | ✅ Implemented |
| Public REST API (agents, calls, leads, numbers, voices, webhooks) | ✅ Implemented |
| Signed outbound webhooks + event bus | ✅ Implemented |
| Text simulation (test an agent with no phone) | ✅ Implemented |
| Web dashboard console | ✅ Implemented |
| Multi-tenancy model (org-scoped data + repository interface) | ✅ In-memory; swap to Postgres via `Store` interface |

**Scaffolded / next up (clear extension points):** real calendar adapters
(Google/Outlook/Cal.com — the `in_memory` provider is functional now), Postgres
persistence (implement the `Store` interface), Stripe billing/metering, the visual
no-code builder UI (the definition schema + API it drives are done), vector-based
KB retrieval, and self-hosted LiveKit realtime as a Twilio alternative. These are
sequenced in [NEXT_STEPS.md](NEXT_STEPS.md).

---

## Requirements

- **Node.js >= 22.6** (uses `--experimental-strip-types` and the global WebSocket).
  Verified on Node 22.23. No dependencies to install.

## Quick start

```bash
cp .env.example .env      # fill in keys (optional for API/dashboard; required for live calls)
npm start                 # boots on PORT (default 3000)
```

Open the console: **http://localhost:3000/?token=YOUR_API_ADMIN_TOKEN**

On boot it seeds a demo org with two agents (a published "Bright Smile Dental" and
"Cool Air HVAC"), so the API and dashboard are immediately usable.

### Environment variables

| Var | Purpose | Needed for |
|-----|---------|-----------|
| `OPENAI_API_KEY` | Realtime voice + text simulation | live calls, simulation |
| `OPENAI_REALTIME_MODEL` | defaults to `gpt-4o-realtime-preview` | live calls |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | telephony + numbers | live calls |
| `TWILIO_CALLER_ID` | outbound caller ID | outbound calls |
| `ELEVENLABS_API_KEY` | stock voices + cloning | voice cloning |
| `PUBLIC_BASE_URL` | your public https URL (for the Twilio media-stream `wss://`) | live calls |
| `API_ADMIN_TOKEN` | bearer token for the REST API + dashboard | always |

> Never commit real secrets. Use a managed secret store in staging/production —
> see [NEXT_STEPS.md](NEXT_STEPS.md) §4.2.

---

## Taking a real call (end-to-end)

> This is the **staging spike**. Production hardening (auth, Twilio signature
> validation, persistence, compliance, launch gates) is covered in
> [NEXT_STEPS.md](NEXT_STEPS.md) Parts II–III.

1. Deploy this server somewhere public (or expose localhost with a tunnel like
   ngrok) and set `PUBLIC_BASE_URL` to that https URL.
2. Set `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`.
3. Search + provision a number:
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     "$PUBLIC_BASE_URL/api/numbers/search?country=US&type=local"
   curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     "$PUBLIC_BASE_URL/api/numbers/provision" \
     -d '{"e164":"+1XXXXXXXXXX","agentId":"<AGENT_ID>"}'
   ```
   (This points the number's voice webhook at `/telephony/voice`.)
4. Call the number. Twilio hits `/telephony/voice`, which returns TwiML that opens
   a Media Stream to `/telephony/media`, where the orchestrator bridges audio to
   the OpenAI Realtime API and runs your agent.

### No phone? Test the agent's brain with text simulation

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  http://localhost:3000/api/agents/<AGENT_ID>/simulate \
  -d '{"messages":[{"role":"user","content":"Hi, do you have any openings this week for a cleaning?"}]}'
```

Or just use the **dashboard** chat box. (Both require `OPENAI_API_KEY`.)

---

## API overview

All `/api/*` routes require `Authorization: Bearer <API_ADMIN_TOKEN>` (except
`/api/health`). Data is scoped to an org via the `X-Org-Id` header (defaults to
the demo org).

```
GET    /api/health
GET    /api/templates              GET /api/templates/:id
GET    /api/languages
GET    /api/agents                 POST /api/agents            (from template or full definition)
GET    /api/agents/:id             PUT  /api/agents/:id        DELETE /api/agents/:id
POST   /api/agents/:id/publish
POST   /api/agents/:id/simulate
GET    /api/calls                  GET  /api/calls/:id         POST /api/calls/outbound
GET    /api/leads
GET    /api/appointments
GET    /api/numbers                GET  /api/numbers/search    POST /api/numbers/provision
GET    /api/voices                 GET  /api/voices/stock      POST /api/voices/clone
GET    /api/webhooks               POST /api/webhooks          DELETE /api/webhooks/:id
```

Create an agent from a template in one call:
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  http://localhost:3000/api/agents -d '{"templateId":"dental"}'
```

---

## Project structure

```
src/
  index.ts                 # server: HTTP + auth + static + WS upgrade + boot
  config/                  # env loader, constants
  core/                    # types, store (Store interface + in-memory), events, ids, logger, validate
  providers/               # adapters behind interfaces
    telephony/twilio.ts    #   numbers + calls (fetch-based)
    voice/openai-realtime  #   realtime session config + connect
    tts/elevenlabs.ts      #   stock voices + cloning
    llm/router.ts          #   model tiering for non-realtime tasks
  agents/                  # templates (22), schema (validation), service (lifecycle)
  skills/                  # booking, knowledgeBase, leadCapture, routing, tools (registry+dispatch)
  voice/                   # instructions builder, orchestrator (Twilio<->OpenAI bridge)
  server/                  # tiny http router, RFC6455 websocket server
  telephony/               # Twilio voice webhook (TwiML)
  api/                     # REST routes, text simulation
  workers/                 # signed webhook delivery
  i18n/                    # 58 languages
  bootstrap/ scripts/      # demo seed
public/index.html          # dashboard console
docs/                      # PRD, ARCHITECTURE, ROADMAP (full-vision plan)
NEXT_STEPS.md              # bootstrap → first live call → production runbook
```

---

## Design notes

- **Provider abstraction:** telephony, realtime voice, and TTS sit behind
  interfaces so vendors can be swapped or run in failover (see `docs/ARCHITECTURE.md`).
- **Config as data:** an agent is a validated `AgentDefinition` (persona, FAQs,
  booking, routing, languages) — exactly what a no-code builder produces.
- **Audio path:** both Twilio and OpenAI Realtime speak G.711 µ-law at 8kHz, so
  audio is passed through without transcoding for low latency; barge-in clears
  Twilio playback when the caller speaks.
- **Swap to a real database:** implement the `Store` interface in
  `src/core/store.ts` against Postgres — no business-logic changes required.

## Scripts

```bash
npm start         # run the server
npm run dev       # run with --watch
npm run seed      # print the seeded demo agents
npm run typecheck # tsc --noEmit (needs @types/node installed to be clean)
```

## License

To be decided by the repository owner (see [NEXT_STEPS.md](NEXT_STEPS.md) §3.3).
