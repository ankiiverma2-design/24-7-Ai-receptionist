# AI Receptionist — Detailed Next Steps and Delivery Process

**Repository:** [ankiiverma2-design/24-7-Ai-receptionist](https://github.com/ankiiverma2-design/24-7-Ai-receptionist)  
**Document purpose:** Turn the current prototype and planning artifacts into a deployed AI receptionist that can take a real call, then harden it into the full multi-tenant SaaS vision.  
**Working product name:** VoxDesk  
**Last updated:** 2026-07-30

## 1. Current state

The GitHub repository is currently empty. It does not yet contain the application, product documents, deployment configuration, automated tests, or a production database.

A working prototype and planning documents exist in the development workspace, but they are not yet versioned in this repository. The prototype currently includes:

- A Node.js/TypeScript server.
- Twilio inbound and outbound call integration.
- A Twilio Media Streams to OpenAI Realtime voice bridge.
- Barge-in handling so callers can interrupt the receptionist.
- FAQ lookup, lead capture, appointment booking, and escalation tools.
- 22 starter industry templates.
- A 58-language configuration catalog.
- ElevenLabs voice-cloning integration with consent fields.
- REST endpoints for agents, calls, leads, appointments, numbers, voices, and webhooks.
- A basic browser dashboard and text simulation.
- An in-memory repository used for prototype data.

This means the immediate goal is **not** to claim the full SaaS is finished. The correct order is:

1. Put the prototype and documents into this repository.
2. Deploy a secure staging instance.
3. Complete one repeatable live inbound call.
4. Replace prototype-only components with production systems.
5. Add the no-code product, billing, integrations, security, and scale features.
6. Run a limited pilot before general availability.

## 2. Target outcome

The final platform should let a service business:

1. Register and create an organization.
2. Select one of 20+ industry templates.
3. Customize the agent's greeting, behavior, FAQs, qualifying questions, languages, routing, and booking rules.
4. Select a stock voice or create a consent-verified cloned voice.
5. Connect or provision a phone number.
6. Connect a calendar and CRM.
7. Publish the agent in under two minutes for the template-based path.
8. Receive inbound calls or place approved outbound calls.
9. Review transcripts, leads, appointments, outcomes, recordings, costs, and analytics.
10. Use a documented API and signed webhooks.

The platform must eventually meet defined security, compliance, reliability, latency, and data-retention standards. A successful demo call alone is not production readiness.

---

# Part I — Get the first real call working

## 3. Phase 0: Establish the GitHub source of truth

### 3.1 Import the existing project

Move the prototype into this repository using a conventional root layout instead of nesting it under another `voxdesk/` folder:

```text
24-7-Ai-receptionist/
├── README.md
├── NEXT_STEPS.md
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── public/
├── src/
└── docs/
    ├── PRD.md
    ├── ARCHITECTURE.md
    └── ROADMAP.md
```

Import these workspace artifacts:

- The application files from the current `voxdesk/` workspace folder.
- `PRD.md`, `ARCHITECTURE.md`, and `ROADMAP.md` from the workspace documentation folder.
- The useful product overview from the workspace root README.

Before committing, reconcile conflicting status statements. The repository README should clearly distinguish:

- What is implemented and verified locally.
- What requires provider credentials or external services.
- What is only scaffolded.
- What is planned for production.

### 3.2 Establish the Git workflow

- Confirm `main` as the protected default branch.
- Use short-lived branches such as `feat/postgres-persistence` or `fix/twilio-signature-validation`.
- Require pull requests for changes to `main`.
- Require at least one review for security-sensitive changes.
- Never commit `.env`, API keys, phone credentials, recordings, or real customer data.
- Use scoped environments: development, staging, and production.

### 3.3 Repository baseline checklist

- [ ] Application source is committed.
- [ ] Product documents are committed under `docs/`.
- [ ] `.env.example` contains names only, never real secrets.
- [ ] `.gitignore` excludes secrets, generated output, logs, recordings, and local databases.
- [ ] README contains local setup and architecture links.
- [ ] License and ownership are decided.
- [ ] Main branch protections are enabled.
- [ ] Initial release is tagged after the staging call succeeds.

**Exit criterion:** A new developer can clone the repository, understand what is implemented, and run the non-provider portions without access to the original development workspace.

## 4. Phase 1: Provider accounts and environment preparation

### 4.1 Required services

For the fastest first-call path, prepare:

- **Twilio:** phone number, inbound call webhook, Media Streams, and optional outbound calling.
- **OpenAI:** realtime voice model access.
- **ElevenLabs:** optional for stock voices and custom voice cloning; not required for the first OpenAI-voice call.
- **Public HTTPS host:** must support long-lived WebSocket connections.
- **DNS:** recommended for staging and required before production.

Later phases add PostgreSQL, Redis, object storage, email/SMS delivery, calendars, CRMs, Stripe, monitoring, and a durable queue.

### 4.2 Secret-management rules

Do not paste provider credentials into chat, source files, screenshots, issue descriptions, or pull requests. Store them in the deployment platform's encrypted secret manager.

Required environment variables for the first call:

```dotenv
PORT=3000
PUBLIC_BASE_URL=https://staging.example.com
LOG_LEVEL=info

OPENAI_API_KEY=managed-by-secret-store
OPENAI_REALTIME_MODEL=provider-supported-realtime-model

TWILIO_ACCOUNT_SID=managed-by-secret-store
TWILIO_AUTH_TOKEN=managed-by-secret-store
TWILIO_CALLER_ID=+15550000000

API_ADMIN_TOKEN=long-random-secret
```

Optional for the cloned-voice flow:

```dotenv
ELEVENLABS_API_KEY=managed-by-secret-store
```

Use separate credentials or provider subaccounts for development, staging, and production. Configure spend alerts and provider concurrency limits before allowing outbound calls.

### 4.3 Legal and operating decisions before recording calls

Decide and document:

- Whether callers hear an AI disclosure.
- Whether calls are recorded.
- How consent is obtained in each launch jurisdiction.
- How long recordings and transcripts are retained.
- Who can access recordings and transcripts.
- How callers request deletion or export.
- Which countries are supported at launch.
- Which outbound-call use cases are allowed.

**Exit criterion:** Provider accounts, staging secrets, a public staging domain, and consent decisions are ready without any secret committed to Git.

## 5. Phase 2: Local validation before telephony

### 5.1 Runtime

Use Node.js 22.6 or newer for the current zero-runtime-dependency prototype.

```bash
node --version
cp .env.example .env
npm start
```

Expected local dashboard:

```text
http://localhost:3000/?token=<API_ADMIN_TOKEN>
```

### 5.2 Required local checks

Check health:

```bash
curl http://localhost:3000/api/health
```

List templates:

```bash
curl \
  -H "Authorization: Bearer $API_ADMIN_TOKEN" \
  http://localhost:3000/api/templates
```

List agents:

```bash
curl \
  -H "Authorization: Bearer $API_ADMIN_TOKEN" \
  http://localhost:3000/api/agents
```

Create an agent from a template:

```bash
curl -X POST \
  -H "Authorization: Bearer $API_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3000/api/agents \
  -d '{"templateId":"dental","name":"Staging Dental Receptionist"}'
```

Publish the agent:

```bash
curl -X POST \
  -H "Authorization: Bearer $API_ADMIN_TOKEN" \
  http://localhost:3000/api/agents/<AGENT_ID>/publish
```

Test the agent without a phone:

```bash
curl -X POST \
  -H "Authorization: Bearer $API_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3000/api/agents/<AGENT_ID>/simulate \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Do you accept insurance, and can I book a cleaning this week?"
      }
    ]
  }'
```

### 5.3 Local acceptance checklist

- [ ] Server starts without an exception.
- [ ] `/api/health` returns HTTP 200.
- [ ] Protected API routes reject missing or invalid tokens.
- [ ] Dashboard loads.
- [ ] At least one template agent can be created and published.
- [ ] Text simulation returns a useful response when an OpenAI key is configured.
- [ ] FAQ retrieval does not invent an answer when no match exists.
- [ ] Lead capture stores the caller's known fields.
- [ ] Booking returns a valid prototype appointment.
- [ ] Human escalation returns a valid routing decision.
- [ ] Logs do not expose API keys or sensitive caller fields.

**Exit criterion:** The application logic is repeatably usable without telephony, and failures produce actionable logs instead of crashing the process.

## 6. Phase 3: Deploy a public staging environment

### 6.1 Hosting requirements

Choose a host that supports:

- Node.js 22 or a compatible container runtime.
- Public HTTPS.
- WebSocket upgrades and long-lived connections.
- Environment secrets.
- Health checks.
- Streaming logs.
- A stable hostname.
- Rollback to a previous deployment.
- Region selection close to callers and voice providers.

Do not use a deployment mode that freezes the process between requests or imposes a WebSocket duration shorter than expected calls.

### 6.2 Deployment configuration

Add one reproducible deployment path, preferably a container definition or a clearly documented managed-Node configuration. The deployment must run:

```bash
npm start
```

Set:

```dotenv
PUBLIC_BASE_URL=https://<staging-domain>
```

The application converts that public HTTPS origin to a WSS media-stream URL. Therefore both endpoints must be reachable externally:

```text
POST https://<staging-domain>/telephony/voice
WSS  wss://<staging-domain>/telephony/media
```

### 6.3 Staging verification

- [ ] HTTPS certificate is valid.
- [ ] `/api/health` returns HTTP 200 externally.
- [ ] Dashboard is not publicly usable without authentication.
- [ ] WebSocket upgrades reach the application.
- [ ] The process remains alive during a multi-minute connection.
- [ ] Logs include a request/call identifier.
- [ ] Provider credentials are read from secrets, not source files.
- [ ] Restart and rollback procedures are documented.

**Exit criterion:** Staging is publicly reachable through HTTPS and WSS and can maintain a voice media session.

## 7. Phase 4: Complete the first live inbound call

### 7.1 Prepare the agent

Use a simple template first. Keep the first test narrow:

- One language.
- A stock provider-supported voice.
- Three verified FAQs.
- One booking service.
- One escalation destination.
- No voice cloning during the first test.

Create and publish the staging agent, then record its `agentId`.

### 7.2 Connect a Twilio phone number

Option A — use the application's provisioning API:

```bash
curl \
  -H "Authorization: Bearer $API_ADMIN_TOKEN" \
  "https://<staging-domain>/api/numbers/search?country=US&type=local"
```

Choose a returned number and provision it:

```bash
curl -X POST \
  -H "Authorization: Bearer $API_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  https://<staging-domain>/api/numbers/provision \
  -d '{
    "e164": "+15550000000",
    "agentId": "<AGENT_ID>",
    "country": "US",
    "type": "local"
  }'
```

Option B — use an existing Twilio number and configure its incoming voice webhook as:

```text
https://<staging-domain>/telephony/voice?agentId=<AGENT_ID>
```

Use HTTP `POST` for the webhook.

### 7.3 Place the call

Call the staging number and follow a scripted conversation:

1. Wait for the greeting.
2. Ask a known FAQ.
3. Interrupt the agent mid-response to test barge-in.
4. Provide a name and phone number.
5. Ask to book the configured service.
6. Confirm one offered appointment time.
7. Ask for a human to test escalation behavior.
8. End the call normally.

### 7.4 Inspect results

After the call, verify:

- A call record exists.
- Direction, numbers, timestamps, and duration are correct.
- Caller and agent transcript turns appear in order.
- The language is correct.
- The FAQ answer is grounded in configured content.
- Lead fields are captured.
- Appointment outcome is recorded.
- Escalation outcome is correct.
- A `call.completed` event is emitted.
- Configured webhooks receive a signed event.
- No secret or unnecessary sensitive data appears in logs.

### 7.5 First-call acceptance criteria

The first-call milestone passes only when all of these are repeatable in at least three consecutive calls:

- [ ] Call connects without manual intervention.
- [ ] Greeting begins promptly.
- [ ] Both sides hear clear audio.
- [ ] The agent understands ordinary speech.
- [ ] Caller interruption stops queued AI playback.
- [ ] Known FAQs are answered correctly.
- [ ] Unknown questions trigger uncertainty or escalation, not invention.
- [ ] Lead details are captured accurately.
- [ ] Booking creates one appointment and does not duplicate it.
- [ ] Call completion is persisted and observable.
- [ ] Failed provider operations produce graceful fallback behavior.

Record the call IDs, approximate response latency, errors, and provider cost for the test run.

### 7.6 Troubleshooting guide

| Symptom | Check |
|---|---|
| Twilio says the application failed | Confirm `/telephony/voice` is public, returns valid TwiML, and does not require bearer auth. |
| Call says no receptionist is configured | Confirm the agent is published and the number/webhook maps to the correct `agentId`. |
| WebSocket never connects | Confirm the host supports WSS upgrades and `PUBLIC_BASE_URL` has the correct public origin. |
| Caller hears silence | Check Twilio Media Streams events, OpenAI realtime connection, audio format, and response events. |
| Agent cannot hear caller | Check inbound media frames and whether audio is forwarded to the realtime provider. |
| Agent audio is distorted | Confirm both sides use the expected G.711 µ-law format and no accidental transcoding occurs. |
| Tool call fails | Inspect the tool name, JSON arguments, provider error, and returned function output. |
| Duplicate booking | Add idempotency keys and transactional booking before production. |
| Call drops after a fixed time | Check host WebSocket timeout, proxy timeout, and provider call limits. |
| High delay | Measure telephony, STT/model, TTS, tool, and network latency separately. |

**Exit criterion:** Three repeatable staging calls satisfy the acceptance criteria and have documented evidence.

---

# Part II — Convert the prototype into a production service

## 8. Phase 5: Durable data and multi-tenancy

The current in-memory store loses data on restart and is not acceptable for customer traffic.

### 8.1 PostgreSQL migration

Implement a PostgreSQL-backed version of the repository interfaces. Create migrations for at least:

- Organizations and workspaces.
- Users, memberships, and roles.
- Agents and immutable agent versions.
- Phone numbers.
- Calls and transcript turns.
- Contacts and leads.
- Appointments.
- Knowledge bases, documents, and chunks.
- Voices and consent records.
- Integrations and encrypted credential references.
- API keys and webhook subscriptions.
- Usage records, plans, and subscriptions.
- Audit logs.

Every tenant-owned row must include `org_id`. Enforce tenant isolation at the service layer and with database row-level security where practical.

### 8.2 Data safeguards

- Use migrations in CI and deployment.
- Encrypt sensitive fields.
- Store recordings and uploaded documents in object storage, not database rows.
- Define data-retention jobs.
- Add backup schedules and a tested restore procedure.
- Add idempotency keys to booking, lead, call, and webhook operations.
- Avoid storing payment card data directly.

### 8.3 Redis and queues

Use Redis for short-lived call/session state, rate limits, and caches. Use a durable queue for:

- Webhook delivery.
- CRM and Google Sheets synchronization.
- Post-call summaries and structured extraction.
- Email/SMS confirmations.
- Document ingestion and embeddings.
- Usage aggregation.
- Scheduled reports.

Use retry policies, exponential backoff, and dead-letter queues. Async integration failures must never block or terminate the live call.

**Exit criterion:** Calls, leads, appointments, configurations, and usage survive restart; tenant isolation and backup restore are tested.

## 9. Phase 6: Production calendar and CRM integrations

### 9.1 Calendar adapters

Replace the in-memory booking provider with provider adapters for:

1. Google Calendar.
2. Microsoft Outlook.
3. Cal.com.
4. Calendly as a later integration if needed.

Each adapter should support:

- OAuth connection and token refresh.
- Availability lookup.
- Conflict prevention.
- Create, reschedule, and cancel.
- Time zones and daylight-saving transitions.
- Service duration and buffers.
- Staff/resource selection.
- Idempotency and provider retries.

Never tell the caller an appointment is booked until the provider confirms it. If the calendar is unavailable, capture the requested time and create a human follow-up task.

### 9.2 CRM and Google Sheets

Start with:

- Google Sheets.
- HubSpot.
- Generic signed webhooks.

Then add Salesforce, Zoho, Pipedrive, GoHighLevel, Zapier, and Make according to demand.

Each integration needs:

- OAuth or scoped credentials.
- Field mapping.
- Idempotent create/update behavior.
- Retry and dead-letter handling.
- Per-tenant status and last-sync errors.
- Disconnect and credential-revocation handling.

**Exit criterion:** A completed call can reliably create/update a CRM lead and a confirmed calendar appointment without duplicate records.

## 10. Phase 7: Authentication, authorization, and API security

Replace the single admin bearer token with proper identity and authorization:

- Sign-up, sign-in, sign-out, password reset, and optional SSO.
- Organizations, invitations, and memberships.
- Owner, admin, and member roles.
- Scoped service/API keys.
- Per-tenant and per-key rate limits.
- Audit records for security-sensitive changes.
- Session revocation.

Required telephony security:

- Validate Twilio webhook signatures.
- Bind media sessions to a server-created, short-lived call token.
- Do not trust arbitrary `agentId` or `callId` WebSocket parameters.
- Restrict transfer destinations and outbound destinations.
- Add anti-fraud limits for outbound calls and premium-rate numbers.
- Add replay protection where applicable.

Required API security:

- Validate all payloads and size limits.
- Require authorization for tenant data.
- Prevent cross-tenant identifier access.
- Use CORS allowlists.
- Add request IDs and security headers.
- Redact secrets and unnecessary PII from logs.
- Rotate provider credentials and API keys.

**Exit criterion:** A security review cannot access another tenant's data, spoof a call session, or execute an unauthorized outbound call.

## 11. Phase 8: Voice and conversation quality

### 11.1 Provider-specific voice routing

Do not pass one provider's voice identifier to another provider. Maintain explicit voice capabilities:

- OpenAI realtime-compatible stock voices for the direct realtime path.
- ElevenLabs cloned voices through an ElevenLabs-compatible TTS pipeline.
- Per-language voice availability.
- Consent status and revocation.
- Fallback stock voice when cloned-voice synthesis fails.

If cloned voices must be used in live calls, the pipeline may need separate streaming STT, LLM, and TTS providers rather than the single-provider realtime loop. Benchmark latency before committing to the architecture.

### 11.2 Voice-clone safeguards

- Capture explicit consent from the voice owner.
- Verify the person and consent artifact according to provider requirements.
- Store who granted consent, how, when, and for which organization.
- Allow revocation and provider deletion.
- Restrict voice sharing across organizations.
- Add abuse review and suspension controls.
- Never create a clone from an unrelated person's recording.

### 11.3 Conversation evaluations

Create a repeatable evaluation suite for:

- Greeting and business identity.
- FAQ grounding.
- Unknown-answer behavior.
- Lead qualification completeness.
- Booking correctness.
- Emergency and human escalation.
- Barge-in and noisy audio.
- Accent and language handling.
- Prompt-injection resistance.
- Provider failure behavior.

Track p50 and p95 latency by stage: telephony, transcription, model first token, synthesis first audio, and tools.

**Exit criterion:** Top scenarios pass automated and human review, and latency meets the product target in the launch regions.

## 12. Phase 9: Knowledge base and 50+ language quality

A language appearing in a configuration list does not prove production quality. Validate each supported language across:

- Speech recognition.
- LLM comprehension.
- Text-to-speech voice availability.
- Dates, times, currencies, names, and phone numbers.
- Mid-call language switching.
- FAQ retrieval and translated business content.
- Consent and disclosure wording.

Roll languages out in tiers:

1. Launch languages with full evaluation and support.
2. Beta languages with visible limitations.
3. Unsupported languages that trigger a safe fallback or transfer.

Upgrade knowledge retrieval from lexical matching to a production ingestion pipeline:

- Manual FAQs.
- Documents.
- Approved URLs.
- Parsing and chunking.
- Embeddings and tenant-isolated vector search.
- Source metadata and freshness.
- Confidence thresholds.
- Safe refusal when grounding is insufficient.

**Exit criterion:** Every advertised language and KB answer has measured quality, supported voices, and a defined fallback.

## 13. Phase 10: No-code agent builder

Build the UI on top of the versioned agent-definition schema rather than creating a second source of truth.

Required builder capabilities:

- Template selection.
- Business profile and greeting.
- Persona and prompt editing.
- Qualifying questions.
- FAQ and document management.
- Booking services and hours.
- Routing and escalation rules.
- Language selection.
- Voice selection and consent-gated cloning.
- Integration connection.
- Browser or phone test call.
- Draft, validation, publish, version history, and rollback.

Add server-side validation and compatibility migration for old agent versions. Publishing must be atomic so an active call continues using the version it started with.

**Exit criterion:** A non-technical pilot customer can configure, test, publish, and roll back an agent without developer assistance.

## 14. Phase 11: Billing, usage, and limits

Use Stripe or another supported billing provider for:

- Trial and paid plans.
- Base subscription.
- Included call minutes.
- Overage charges.
- Phone-number charges.
- Voice-cloning add-ons.
- Reseller or agency plans.
- Invoices, failed-payment handling, and cancellation.

Meter usage from authoritative events. Reconcile provider usage and internal records. Add limits for:

- Concurrent calls.
- Monthly minutes.
- Outbound calls.
- Numbers.
- Agents.
- API requests.
- Stored recordings and documents.

Display near-real-time usage and cost estimates. Add spend alerts and automatic safeguards against unexpected provider spend.

**Exit criterion:** Usage is traceable from call to invoice, and account limits cannot be bypassed through retries or concurrent requests.

## 15. Phase 12: Observability, reliability, and scale

### 15.1 Observability

Add structured logs, metrics, and distributed traces. Correlate all activity by:

- Organization ID.
- Agent/version ID.
- Internal call ID.
- Provider call ID.
- Media stream ID.
- Tool call ID.
- Request/event ID.

Monitor:

- Active and concurrent calls.
- Call setup failures and drop rate.
- Per-stage latency.
- STT/TTS/model/provider errors.
- Tool failure and timeout rate.
- Booking and qualification conversion.
- Webhook and CRM backlog.
- Cost per call and per minute.
- Database, queue, and cache health.

Do not place full transcripts, credentials, or unnecessary PII in general application logs.

### 15.2 Reliability

- Add timeouts and circuit breakers around providers.
- Implement provider fallback where quality has been tested.
- Define graceful degradation for calendar, CRM, TTS, and model outages.
- Add regional media routing where needed.
- Run synthetic canary calls.
- Create on-call alerts and incident runbooks.
- Test deployment rollback.
- Test database backup restoration.
- Define SLOs and an error budget.

### 15.3 Scale testing

Test in stages:

1. Single call for correctness.
2. Ten concurrent calls.
3. Expected pilot peak.
4. Expected production peak.
5. Soak test for memory leaks and connection cleanup.
6. Failure test with slow or unavailable providers.

Confirm provider account limits before load testing. Never generate unsolicited calls for testing.

**Exit criterion:** The system meets the concurrency, latency, availability, recovery, and cost targets for the planned launch tier.

---

# Part III — Compliance and launch

## 16. Security, privacy, and compliance checklist

Complete a jurisdiction-specific review before customer traffic. At minimum:

- [ ] Privacy policy and terms are published.
- [ ] AI disclosure policy is documented.
- [ ] Call-recording consent is handled per jurisdiction (one-party vs. all-party rules).
- [ ] Voice-clone consent is captured, verified, and stored.
- [ ] Data-retention and deletion policies are implemented.
- [ ] Data-subject export and deletion (GDPR/CCPA) is supported.
- [ ] Data is encrypted in transit and at rest.
- [ ] Secrets are stored in a managed secret store and rotated.
- [ ] Access to recordings, transcripts, and PII is role-restricted and logged.
- [ ] Audit logs exist for configuration and security actions.
- [ ] Dependency, SAST, DAST, and penetration reviews are complete.
- [ ] A HIPAA path is defined if healthcare tenants are onboarded (BAA-capable vendors, restricted PHI flow).
- [ ] Outbound calling complies with local telemarketing and consent rules.
- [ ] An incident-response and breach-notification process exists.

**Exit criterion:** Legal, privacy, and security signoff is recorded before any real customer call is handled.

## 17. Phase 13: Pilot and general availability

Do not launch broadly from the first successful call. Use gated rollout:

1. **Internal pilot.** Run the platform for one or two friendly businesses under supervision.
2. **Limited pilot.** Onboard a small set of paying customers with usage caps and close monitoring.
3. **Canary release.** Route a small percentage of new signups to the full flow while watching KPIs.
4. **General availability.** Open signups only after stability, quality, cost, and support targets hold.

Track these KPIs during the pilot:

- Missed-call rate for active tenants.
- Booking conversion rate.
- Lead qualification rate.
- Containment (calls handled without human transfer).
- Conversation latency p50 and p95.
- Call drop rate.
- Cost per call and gross margin.
- Customer-reported issues.

### 17.1 Launch gate checklist

- [ ] Staging signoff on all first-call acceptance criteria.
- [ ] Durable database with tested backup and restore.
- [ ] Real calendar and CRM integrations verified.
- [ ] Authentication, authorization, and tenant isolation reviewed.
- [ ] Twilio signature validation and call-session binding enabled.
- [ ] Billing, metering, and account limits verified.
- [ ] Monitoring, alerting, and runbooks in place.
- [ ] Rollback and disaster-recovery drills completed.
- [ ] Legal, privacy, and security signoff recorded.
- [ ] Support and escalation process defined.
- [ ] Provider spend limits and concurrency limits configured.

**Exit criterion:** All launch-gate items are complete, and a limited pilot has met its KPI targets.

---

## 18. Prioritized backlog summary

Recommended order of execution:

1. Import prototype and documents into this repository (Phase 0).
2. Prepare provider accounts, secrets, and consent decisions (Phase 1).
3. Validate the application locally without a phone (Phase 2).
4. Deploy secure public staging with HTTPS and WSS (Phase 3).
5. Complete three repeatable live inbound calls (Phase 4).
6. Add PostgreSQL persistence and multi-tenancy (Phase 5).
7. Add real calendar and CRM integrations (Phase 6).
8. Add authentication, authorization, and telephony security (Phase 7).
9. Fix provider-specific voice routing and clone safeguards (Phase 8).
10. Validate language and knowledge-base quality (Phase 9).
11. Build the no-code agent builder (Phase 10).
12. Add billing, usage metering, and limits (Phase 11).
13. Add observability, reliability, and scale testing (Phase 12).
14. Complete security, privacy, and compliance review (Phase 16).
15. Run the gated pilot and reach general availability (Phase 13).

## 19. Definition of done

The project reaches its first major milestone when a real inbound call is answered by the AI, understood, and completed with a captured lead and a confirmed booking, using deployed staging infrastructure, with the evidence recorded.

The project reaches production readiness only when durable data, real integrations, authentication, telephony security, billing, observability, compliance signoff, and a successful gated pilot are all complete.

## 20. Related documents

Once the prototype and documents are imported into this repository, link them here:

- `docs/PRD.md` — product requirements and scope.
- `docs/ARCHITECTURE.md` — system design and provider abstractions.
- `docs/ROADMAP.md` — phased plan for the full-vision platform.
- `README.md` — local setup, run instructions, and API overview.

Until those files are committed to this repository, they live only in the development workspace and cannot be linked from GitHub.