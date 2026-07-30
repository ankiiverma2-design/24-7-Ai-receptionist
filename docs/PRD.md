# Product Requirements Document — AI Receptionist Platform

**Product name (working):** VoxDesk — 24/7 AI Voice Receptionist Platform
**Document version:** 1.0
**Status:** Draft for review
**Scope:** Full-vision multi-tenant SaaS (voice cloning, 20+ industry templates, 50+ languages, public API, no-code builder, scale)
**Owner:** Product
**Last updated:** 2026-07-30

---

## 1. Overview

### 1.1 Summary
VoxDesk is a multi-tenant SaaS platform that lets service businesses deploy an AI-powered voice receptionist that answers inbound calls and places outbound calls 24/7. The AI qualifies leads, books appointments, answers FAQs, and routes callers intelligently using natural, low-latency, human-like conversation. Businesses launch a working agent in under two minutes with no coding, using industry templates, and can deeply customize prompts, workflows, integrations, and even the agent's cloned voice.

### 1.2 Problem
Service businesses (clinics, salons, law firms, home services, real estate, etc.) miss a large share of inbound calls — after hours, during peak times, or when staff are busy. Every missed call is a lost lead or a frustrated customer. Traditional answering services are expensive, generic, and don't book appointments or update the CRM. Hiring 24/7 reception staff is cost-prohibitive.

### 1.3 Solution
A configurable AI receptionist that:
- Answers every call instantly, 24/7, in the caller's language.
- Sounds natural and can be cloned to the business owner's own voice.
- Qualifies leads with business-specific questions.
- Books appointments directly into the business calendar.
- Answers FAQs from a knowledge base.
- Routes or transfers calls to humans when needed.
- Logs every interaction to Google Sheets / CRM and fires webhooks.

### 1.4 Goals
- Reduce missed-call rate for tenants to near zero.
- Convert missed calls into booked appointments and qualified leads.
- Time-to-first-live-agent under 2 minutes for a templated setup.
- Support scale to thousands of concurrent calls with high reliability.

### 1.5 Non-goals (v1 full vision)
- Full omnichannel (SMS/email/chat) is a fast-follow, not core v1. (Voice is the wedge.)
- Deep vertical CRMs beyond a defined integration set at GA.
- On-device / offline operation.
- Human-agent workforce marketplace.

---

## 2. Target users & personas

### 2.1 Buyer personas
- **Small-business owner (primary):** Owns a clinic, salon, garage, or agency. Non-technical. Wants more booked jobs and to stop missing calls. Values fast setup and price.
- **Agency / reseller (secondary):** Sets up and manages receptionists for many client businesses. Needs white-label, multi-account management, and margins.
- **Operations / RevOps at SMB-mid (secondary):** Wants CRM integration, reporting, and reliability.

### 2.2 End users
- **Callers:** Customers/prospects phoning the business. Care about being understood, fast answers, and easy booking.
- **Business staff:** Receive transfers/escalations, review call logs, adjust the agent.

### 2.3 Key jobs-to-be-done
- "When I can't answer, still book the appointment."
- "Answer common questions so my phone stops ringing for the same thing."
- "Capture and qualify every lead into my CRM automatically."
- "Sound like my business, in my customer's language."

---

## 3. Core features & requirements

Priorities: **P0** = required for GA of the full vision; **P1** = important, fast-follow; **P2** = later.

### 3.1 Real-time voice conversation (P0)
- Inbound and outbound calling over PSTN.
- Full-duplex, low-latency pipeline: STT → LLM → TTS.
- Barge-in / interruption handling and natural turn-taking.
- Target end-to-end response latency **< 800 ms p50, < 1.2 s p95**.
- Background-noise robustness and echo handling.
- Configurable filler/backchannel behavior for naturalness.
- Graceful fallback when the model is uncertain (clarify, repeat, or escalate).

### 3.2 Industry templates (P0)
- 20+ ready-to-use templates (e.g., dental, medical, legal, real estate, HVAC, plumbing, salon/spa, auto repair, restaurant, fitness, veterinary, insurance, home cleaning, roofing, electrician, landscaping, moving, tutoring, property management, general SMB).
- Each template ships with: prompt/persona, qualifying questions, FAQ starter set, booking flow, routing rules, and voice suggestion.
- Templates are cloneable and fully editable per tenant.

### 3.3 Multi-language support (P0)
- 50+ languages at GA (target 100+ over time), covering STT, LLM understanding, and TTS.
- Automatic language detection at call start, with per-tenant allowed-language config.
- Mid-call language switching when the caller changes language.
- Localized prompts, date/time, and number handling.

### 3.4 Custom voice cloning (P0)
- Per-tenant custom voice from a short recorded sample.
- Consent capture and verification workflow (voice-cloning misuse prevention).
- Library of high-quality stock voices as the default.
- Voice preview before going live.

### 3.5 Lead qualification & capture (P0)
- Configurable qualifying question sets per agent/template.
- Structured extraction of caller data (name, contact, intent, urgency, service, budget signals).
- Lead scoring / tagging rules.

### 3.6 Appointment booking (P0)
- Real-time calendar availability lookup and booking.
- Integrations: Google Calendar, Microsoft/Outlook, Cal.com; Calendly (P1).
- Confirmation via SMS/email; reschedule/cancel handling (P1).
- Time-zone aware.

### 3.7 FAQ / knowledge base (P0)
- Per-tenant knowledge base (manual entries + document/URL ingestion).
- Retrieval-augmented answers grounded in the KB with anti-hallucination guardrails.
- "I don't know" → escalation path.

### 3.8 Intelligent call routing & transfer (P0)
- Warm/cold transfer to human numbers or departments.
- Business-hours logic; after-hours behavior.
- Voicemail capture + transcription when no human is available.
- Conditional routing based on intent, language, or qualification outcome.

### 3.9 Phone number provisioning (P0)
- Instant number search and provisioning (local, toll-free) in supported countries.
- Port-in existing numbers (P1).
- Multiple numbers per tenant/agent.

### 3.10 Integrations (P0/P1)
- **P0:** Google Sheets, Google Calendar, generic Webhooks, HubSpot.
- **P1:** Salesforce, Zoho, Pipedrive, GoHighLevel, Zapier/Make, Slack notifications.
- Outbound webhooks on call events (started, completed, booked, qualified, transferred, voicemail).

### 3.11 No-code agent builder (P0)
- Visual flow builder for conversation steps, branches, and actions.
- Prompt editor with variables and knowledge-base linking.
- Test-call sandbox from the browser before going live.
- Versioning and publish/rollback of agent configs.

### 3.12 Public API & webhooks (P0)
- REST API for agents, numbers, calls, contacts, bookings, and analytics.
- Webhook subscriptions with signing + retries.
- API keys, scopes, and rate limits per tenant.
- OpenAPI spec + docs + SDKs (JS/Python) (SDKs P1).

### 3.13 Analytics & reporting (P0)
- Per-call transcripts, recordings (with consent), sentiment, outcome, duration.
- Dashboards: call volume, answer rate, booking rate, qualification rate, cost per call, language mix.
- Exports and scheduled reports (P1).

### 3.14 Multi-tenancy, accounts & billing (P0)
- Organizations, workspaces, roles (owner/admin/member), invitations.
- Usage metering (call minutes, numbers, cloned voices) and Stripe billing.
- Plan tiers + overage; free trial.
- White-label / reseller sub-accounts (P1).

### 3.15 Reliability & scale (P0)
- Handle thousands of concurrent calls.
- 24/7 operation with graceful degradation and provider failover.
- Observability: logging, tracing, alerting, per-tenant health.

---

## 4. Functional requirements (selected, testable)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | The system shall answer an inbound call within 2 rings and begin the greeting. | P0 |
| FR-2 | The system shall detect the caller's language within the first utterance and respond in that language when it is in the tenant's allowed set. | P0 |
| FR-3 | The system shall book an appointment into the connected calendar and return a confirmation reference within the call. | P0 |
| FR-4 | The system shall log every call with transcript, outcome, and captured fields to the configured Google Sheet / CRM within 60s of call end. | P0 |
| FR-5 | The system shall transfer to a human number when the configured escalation condition is met. | P0 |
| FR-6 | The system shall provision a phone number and attach it to an agent from the dashboard without engineering involvement. | P0 |
| FR-7 | The system shall let a tenant clone a voice only after recorded consent is captured and stored. | P0 |
| FR-8 | The system shall fire signed webhooks for defined call lifecycle events with at-least-once delivery and retries. | P0 |
| FR-9 | The no-code builder shall allow publishing a new agent version and rolling back to a previous version. | P0 |
| FR-10 | The API shall enforce per-tenant rate limits and scoped API keys. | P0 |

---

## 5. Non-functional requirements

- **Latency:** conversational response < 800 ms p50 / < 1.2 s p95.
- **Availability:** 99.9% monthly for call handling; provider failover for STT/TTS/LLM/telephony.
- **Scale:** thousands of concurrent calls; horizontal autoscaling.
- **Security:** encryption in transit and at rest; secrets management; least-privilege access.
- **Privacy & compliance:** call-recording consent handling per jurisdiction; GDPR/CCPA data rights; configurable data retention; voice-clone consent records. HIPAA readiness path for healthcare tenants (BAA-capable vendors, PHI handling) — target as a compliance milestone.
- **Data residency:** region selection roadmap (P1).
- **Accessibility:** dashboard WCAG 2.1 AA target.
- **Auditability:** admin/action audit logs.

---

## 6. Success metrics (KPIs)

**Product/outcome**
- Missed-call rate for active tenants (target: < 2%).
- Booking conversion rate (booked / eligible calls).
- Lead qualification rate.
- Caller containment (resolved without human transfer).

**Quality**
- Conversation latency p50/p95.
- STT word error rate by top languages.
- Call-completion / drop rate.
- CSAT / post-call rating (where sampled).

**Business**
- Time-to-first-live-agent (target < 2 min templated).
- Activation rate (tenants with ≥1 live agent taking real calls).
- Net revenue retention; gross margin per call minute.

---

## 7. Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Voice latency feels robotic/slow | Churn | Streaming pipeline, edge/regional media, provider selection, aggressive p95 budget |
| Voice-clone misuse | Legal/brand | Mandatory consent capture, verification, abuse detection, watermark where available |
| Hallucinated answers | Trust/liability | KB grounding, confidence thresholds, escalation, guardrails |
| Provider outages (STT/TTS/LLM/telephony) | Downtime | Multi-provider abstraction + failover |
| Telephony/regulatory (per-country rules) | Blocked launches | Phase country rollout; compliant number provisioning; recording-consent config |
| Cost per minute erodes margin | Unit economics | Model tiering, caching, usage-based pricing + overage |
| PII/PHI handling | Compliance breach | Encryption, retention controls, BAA vendors, access controls |

---

## 8. Dependencies (build-vs-buy)

- **Voice orchestration / telephony:** managed provider (e.g., Vapi, Retell, Bland) OR self-hosted realtime (LiveKit Agents) + Twilio. Abstracted behind an internal interface.
- **STT / TTS / voice cloning:** Deepgram/Whisper (STT); ElevenLabs/Cartesia/PlayHT (TTS + cloning).
- **LLM:** OpenAI / Anthropic / others, behind a model router.
- **Calendars/CRM:** Google, Microsoft, Cal.com, HubSpot, etc.
- **Billing:** Stripe.
- **Infra:** cloud + managed Postgres, Redis, object storage, queue.

> See `ARCHITECTURE.md` for the technical design and `ROADMAP.md` for phasing.

---

## 9. Open questions

1. Build the realtime voice pipeline in-house (LiveKit) for margin/control, or start on a managed provider for speed then migrate?
2. Which 20 industries are launch templates vs. fast-follow?
3. Which countries for number provisioning at GA (regulatory effort varies)?
4. HIPAA at GA, or gated behind a later healthcare tier?
5. White-label/reseller at GA or P1?
6. Recording default: opt-in vs. opt-out per region?

---

## 10. Glossary
- **STT:** Speech-to-text. **TTS:** Text-to-speech. **Barge-in:** caller interrupts the agent mid-speech.
- **Containment:** call handled fully by AI without human transfer.
- **Agent:** a configured AI receptionist (persona + flow + voice + integrations).
- **Tenant / Organization:** a customer account on the platform.
