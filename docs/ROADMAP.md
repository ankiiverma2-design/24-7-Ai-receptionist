# Roadmap — AI Receptionist Platform (VoxDesk)

**Version:** 1.0
**Companion to:** `PRD.md`, `ARCHITECTURE.md`
**Timeline horizon:** ~3–6 months to full-vision GA (team-dependent)
**Last updated:** 2026-07-30

This roadmap phases the full-vision build. Timeboxes assume a small cross-functional team (≈3–6 engineers + product/design). Adjust for team size. Each phase ends with a shippable, testable milestone.

---

## Phase 0 — Foundations & spike (Weeks 1–2)

**Goal:** de-risk the hardest thing (realtime voice quality) and set up the skeleton.

- Provider spike: stand up one working inbound AI call via a managed voice provider; measure real latency and quality.
- Decisions locked: managed-vs-self-host, Node-vs-Python, DB isolation strategy (see decision lists in PRD/ARCH).
- Repo, CI/CD, environments, IaC baseline, secrets management.
- Core data model + auth + multi-tenant scaffolding.
- Telephony/STT/TTS/LLM **adapter interfaces** defined (even if only one impl each).

**Exit criteria:** a real phone number rings, the AI answers and holds a basic conversation; latency measured; skeleton deployable.

---

## Phase 1 — MVP: one great agent (Weeks 3–6)

**Goal:** a single-tenant-quality inbound receptionist that's genuinely useful, in English.

- Voice orchestrator: streaming STT→LLM→TTS, barge-in, turn-taking, session state.
- Number provisioning (self-serve, 1 country).
- FAQ / knowledge base (manual entries + basic retrieval + grounding).
- Appointment booking (Google Calendar first).
- Lead capture + structured extraction.
- Call logging: transcript, outcome, Google Sheets sync.
- Basic dashboard: agents list, call log, transcripts.
- Stock voices (no cloning yet).

**Exit criteria:** hits FR-1, FR-3 (Google Calendar), FR-4 (Sheets); latency p50 < 1s in test calls; internal dogfood with a real business scenario.

---

## Phase 2 — Multi-tenant SaaS & builder (Weeks 7–11)

**Goal:** sellable multi-tenant product with self-serve setup.

- Organizations/workspaces/roles, invitations, audit logs.
- Stripe billing: plans, usage metering (call minutes/numbers), trial, overage.
- No-code agent builder v1: flow editor, prompt editor, KB linking, browser test-call, publish/rollback.
- 5–8 launch industry templates.
- Intelligent routing/transfer + after-hours + voicemail.
- Event bus + async workers (webhooks, CRM sync groundwork).
- HubSpot integration + generic signed webhooks.
- Analytics dashboard v1 (volume, answer/booking/qualification rates).

**Exit criteria:** an external pilot tenant can self-serve sign up, build an agent from a template, go live, and get booked appointments + CRM/Sheets logging. Time-to-live measured toward the < 2-min goal for templated setup.

---

## Phase 3 — Differentiators: voice cloning + languages (Weeks 12–16)

**Goal:** the standout features from the vision.

- Custom voice cloning per tenant + **consent capture/verification** workflow (FR-7).
- Multi-language: auto-detection, 50+ languages across STT/LLM/TTS, mid-call switching, localized formatting.
- Expand templates to 20+ industries.
- Outbound calling (campaigns/callbacks) + associated compliance guards.
- More calendars/CRMs (Outlook, Cal.com; Salesforce/Zoho/GHL as feasible) + Zapier/Make.
- Reschedule/cancel + SMS/email confirmations.

**Exit criteria:** a tenant can clone their voice (with consent), run the agent in 50+ languages, and choose from 20+ templates.

---

## Phase 4 — Public API, scale & hardening (Weeks 17–22)

**Goal:** platform-grade — open API, reliability, and scale.

- Public REST API + OpenAPI docs + webhook subscription management + scoped keys/rate limits (FR-8, FR-10).
- SDKs (JS/Python).
- Reliability: provider failover/circuit breakers, graceful degradation paths, DLQs.
- Load & soak testing toward thousands of concurrent calls; autoscaling validated.
- Observability: tracing per voice hop, per-tenant health, canary calls, alerting.
- Security review + pen test; data retention/deletion (GDPR/CCPA) tooling.
- (Optional) begin **self-hosted LiveKit** migration of the realtime core for margin/control.

**Exit criteria:** meets NFRs (latency p95, 99.9% availability target, concurrency); API is documented and usable by a third party.

---

## Phase 5 — GA polish & expansion (Weeks 23–26+)

**Goal:** launch-ready and extensible.

- White-label / reseller sub-accounts.
- Advanced analytics (sentiment, exports, scheduled reports).
- More countries for number provisioning + number port-in.
- HIPAA-readiness milestone for healthcare tier (BAA vendors, PHI controls).
- Data residency / region selection.
- Marketplace-ready template & integration ecosystem.

**Exit criteria:** full-vision GA per PRD scope; pricing/packaging finalized; onboarding under 2 minutes for templated agents.

---

## Cross-cutting workstreams (run continuously)
- **Quality/evals:** conversation-quality test suite, per-language WER tracking, latency budgets in CI.
- **Cost/unit-economics:** model tiering, caching, per-minute cost monitoring vs. pricing.
- **Compliance:** recording/voice-clone consent, retention, regional telephony rules.
- **Design/UX:** onboarding funnel, builder usability, call-debug tooling.

---

## Milestone summary

| Phase | Focus | Approx. weeks | Key milestone |
|-------|-------|---------------|---------------|
| 0 | Foundations & voice spike | 1–2 | AI answers a real call |
| 1 | MVP single agent (EN) | 3–6 | Books via Google Calendar, logs to Sheets |
| 2 | Multi-tenant SaaS + builder | 7–11 | External pilot self-serves & goes live |
| 3 | Voice cloning + 50+ languages | 12–16 | Cloned voice, 20+ templates, multilingual |
| 4 | Public API + scale + hardening | 17–22 | Meets NFRs; open API |
| 5 | GA polish + expansion | 23–26+ | Full-vision GA |

---

## Assumptions & caveats
- Timeboxes scale with team size; a solo builder should expect the longer end (6+ months) and may sequence phases more strictly.
- Starting on a **managed voice provider** is what makes early phases fast; self-hosting is deferred to Phase 4+.
- Regulatory work (telephony per country, HIPAA, recording consent) can gate specific launches independent of engineering readiness.
- Sequencing is deliberately **quality-first** (voice latency/naturalness) before breadth (languages, templates, API).
