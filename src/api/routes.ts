/**
 * Public REST API route registration.
 *
 * All routes are tenant-scoped via ctx.orgId (resolved by auth in index.ts).
 * Handlers stay thin: validate -> call service/store -> respond.
 */
import { Router, json, badRequest, notFound, type Ctx } from '../server/http.ts';
import { store } from '../core/store.ts';
import { newId, nowIso } from '../core/ids.ts';
import { TEMPLATES, getTemplate } from '../agents/templates.ts';
import { LANGUAGES } from '../i18n/languages.ts';
import { validateCreateAgent, validateUpdateAgent } from '../agents/schema.ts';
import {
  createAgent,
  createAgentFromTemplate,
  updateAgent,
  publishAgent,
} from '../agents/service.ts';
import { twilioProvider } from '../providers/telephony/twilio.ts';
import { elevenLabsProvider } from '../providers/tts/elevenlabs.ts';
import { env } from '../config/env.ts';
import type { PhoneNumber, Voice, WebhookSubscription } from '../core/types.ts';
import { runTextSimulation } from './simulate.ts';
import { registerAuthRoutes } from './authRoutes.ts';
import { registerAnalyticsRoutes } from './analyticsRoutes.ts';
import { checkLimit } from '../billing/usage.ts';

function limited(c: Ctx, resource: 'agent' | 'number' | 'outbound_call' | 'voice_clone'): string | null {
  const check = checkLimit(c.orgId, resource);
  return check.allowed ? null : check.reason;
}

export function buildApiRouter(): Router {
  const r = new Router();

  // ---- Auth + account + analytics ----
  registerAuthRoutes(r);
  registerAnalyticsRoutes(r);

  // ---- Health ----
  r.get('/api/health', (c) => json(c.res, 200, { ok: true, ts: nowIso() }));

  // ---- Templates ----
  r.get('/api/templates', (c) =>
    json(c.res, 200, {
      templates: TEMPLATES.map((t) => ({
        id: t.id,
        industry: t.industry,
        name: t.name,
        description: t.description,
      })),
    }),
  );
  r.get('/api/templates/:id', (c) => {
    const t = getTemplate(c.params.id);
    return t ? json(c.res, 200, t) : notFound(c.res, 'Template not found');
  });

  // ---- Languages ----
  r.get('/api/languages', (c) => json(c.res, 200, { languages: LANGUAGES }));

  // ---- Agents ----
  r.get('/api/agents', (c) => json(c.res, 200, { agents: store.agents.list(c.orgId) }));

  r.get('/api/agents/:id', (c) => {
    const a = store.agents.get(c.params.id);
    return a && a.orgId === c.orgId ? json(c.res, 200, a) : notFound(c.res, 'Agent not found');
  });

  r.post('/api/agents', (c) => {
    const limit = limited(c, 'agent');
    if (limit) return json(c.res, 402, { error: 'plan_limit', message: limit });
    // Two creation modes: from a template, or from a full definition.
    if (c.body?.templateId && !c.body?.definition) {
      const agent = createAgentFromTemplate(c.orgId, c.body.templateId, c.body.name);
      return agent
        ? json(c.res, 201, agent)
        : badRequest(c.res, [`Unknown templateId: ${c.body.templateId}`]);
    }
    const parsed = validateCreateAgent(c.body);
    if (!parsed.ok) return badRequest(c.res, parsed.errors);
    return json(c.res, 201, createAgent(c.orgId, parsed.value));
  });

  r.put('/api/agents/:id', (c) => {
    const existing = store.agents.get(c.params.id);
    if (!existing || existing.orgId !== c.orgId) return notFound(c.res, 'Agent not found');
    const parsed = validateUpdateAgent(c.body);
    if (!parsed.ok) return badRequest(c.res, parsed.errors);
    return json(c.res, 200, updateAgent(c.params.id, parsed.value));
  });

  r.post('/api/agents/:id/publish', (c) => {
    const existing = store.agents.get(c.params.id);
    if (!existing || existing.orgId !== c.orgId) return notFound(c.res, 'Agent not found');
    return json(c.res, 200, publishAgent(c.params.id));
  });

  r.delete('/api/agents/:id', (c) => {
    const existing = store.agents.get(c.params.id);
    if (!existing || existing.orgId !== c.orgId) return notFound(c.res, 'Agent not found');
    store.agents.delete(c.params.id);
    return json(c.res, 200, { deleted: true });
  });

  // ---- Text simulation (test an agent without a phone) ----
  r.post('/api/agents/:id/simulate', async (c) => {
    const agent = store.agents.get(c.params.id);
    if (!agent || agent.orgId !== c.orgId) return notFound(c.res, 'Agent not found');
    const messages = Array.isArray(c.body?.messages) ? c.body.messages : [];
    try {
      const result = await runTextSimulation(agent, messages);
      return json(c.res, 200, result);
    } catch (e) {
      return json(c.res, 502, { error: 'simulation_failed', message: (e as Error).message });
    }
  });

  // ---- Calls ----
  r.get('/api/calls', (c) => json(c.res, 200, { calls: store.calls.list(c.orgId) }));
  r.get('/api/calls/:id', (c) => {
    const call = store.calls.get(c.params.id);
    return call && call.orgId === c.orgId ? json(c.res, 200, call) : notFound(c.res, 'Call not found');
  });

  // Start an outbound call via Twilio.
  r.post('/api/calls/outbound', async (c) => {
    const { agentId, to } = c.body ?? {};
    const agent = agentId ? store.agents.get(agentId) : undefined;
    if (!agent || agent.orgId !== c.orgId) return badRequest(c.res, ['Unknown agentId']);
    if (!to) return badRequest(c.res, ['`to` phone number is required']);
    const limit = limited(c, 'outbound_call');
    if (limit) return json(c.res, 402, { error: 'plan_limit', message: limit });
    const callId = newId('call');
    store.calls.create({
      id: callId,
      orgId: c.orgId,
      agentId,
      direction: 'outbound',
      from: env.twilioCallerId || 'unknown',
      to,
      startedAt: nowIso(),
      transcript: [],
      capturedFields: {},
      provider: 'twilio',
    });
    try {
      const answerUrl = `${env.publicBaseUrl}/telephony/voice?agentId=${agentId}&callId=${callId}`;
      const res = await twilioProvider.startOutboundCall({
        to,
        from: env.twilioCallerId,
        answerUrl,
      });
      store.calls.update(callId, { providerRef: res.providerRef });
      return json(c.res, 201, { callId, providerRef: res.providerRef });
    } catch (e) {
      return json(c.res, 502, { error: 'telephony_error', message: (e as Error).message });
    }
  });

  // ---- Leads & appointments ----
  r.get('/api/leads', (c) => json(c.res, 200, { leads: store.leads.list(c.orgId) }));
  r.get('/api/appointments', (c) =>
    json(c.res, 200, { appointments: store.appointments.list(c.orgId) }),
  );

  // ---- Phone numbers ----
  r.get('/api/numbers', (c) => json(c.res, 200, { numbers: store.numbers.list(c.orgId) }));

  r.get('/api/numbers/search', async (c) => {
    const country = c.query.get('country') ?? 'US';
    const type = (c.query.get('type') as 'local' | 'tollfree') ?? 'local';
    try {
      const results = await twilioProvider.searchNumbers(country, type);
      return json(c.res, 200, { available: results });
    } catch (e) {
      return json(c.res, 502, { error: 'telephony_error', message: (e as Error).message });
    }
  });

  r.post('/api/numbers/provision', async (c) => {
    const { e164, agentId, country, type } = c.body ?? {};
    if (!e164) return badRequest(c.res, ['`e164` is required']);
    const limit = limited(c, 'number');
    if (limit) return json(c.res, 402, { error: 'plan_limit', message: limit });
    const voiceWebhook = `${env.publicBaseUrl}/telephony/voice${agentId ? `?agentId=${agentId}` : ''}`;
    try {
      const res = await twilioProvider.provisionNumber(e164, voiceWebhook);
      const number: PhoneNumber = {
        id: newId('num'),
        orgId: c.orgId,
        e164: res.e164,
        country: country ?? 'US',
        type: type ?? 'local',
        agentId,
        provider: 'twilio',
        providerRef: res.providerRef,
        createdAt: nowIso(),
      };
      store.numbers.create(number);
      return json(c.res, 201, number);
    } catch (e) {
      return json(c.res, 502, { error: 'telephony_error', message: (e as Error).message });
    }
  });

  // ---- Voices (stock + cloning) ----
  r.get('/api/voices', (c) => json(c.res, 200, { voices: store.voices.list(c.orgId) }));

  r.get('/api/voices/stock', async (c) => {
    try {
      const voices = await elevenLabsProvider.listStockVoices();
      return json(c.res, 200, { voices });
    } catch (e) {
      return json(c.res, 502, { error: 'tts_error', message: (e as Error).message });
    }
  });

  // Clone a voice. Consent is REQUIRED and stored before the clone is usable.
  r.post('/api/voices/clone', async (c) => {
    const { name, sampleBase64, sampleMimeType, consent } = c.body ?? {};
    if (!name || !sampleBase64) {
      return badRequest(c.res, ['`name` and `sampleBase64` are required']);
    }
    if (!consent?.granted || !consent?.grantedBy) {
      return badRequest(c.res, [
        'Voice cloning requires consent: { granted: true, grantedBy, method }.',
      ]);
    }
    const limit = limited(c, 'voice_clone');
    if (limit) return json(c.res, 402, { error: 'plan_limit', message: limit });
    try {
      const sample = Buffer.from(sampleBase64, 'base64');
      const result = await elevenLabsProvider.cloneVoice({
        name,
        sample,
        sampleMimeType: sampleMimeType ?? 'audio/mpeg',
      });
      const voice: Voice = {
        id: newId('voice'),
        orgId: c.orgId,
        name,
        type: 'cloned',
        provider: 'elevenlabs',
        providerVoiceId: result.providerVoiceId,
        consent: {
          granted: true,
          grantedBy: consent.grantedBy,
          method: consent.method ?? 'checkbox',
          capturedAt: nowIso(),
        },
        createdAt: nowIso(),
      };
      store.voices.create(voice);
      return json(c.res, 201, voice);
    } catch (e) {
      return json(c.res, 502, { error: 'tts_error', message: (e as Error).message });
    }
  });

  // ---- Webhook subscriptions ----
  r.get('/api/webhooks', (c) => json(c.res, 200, { webhooks: store.webhooks.list(c.orgId) }));

  r.post('/api/webhooks', (c) => {
    const { url, events } = c.body ?? {};
    if (!url) return badRequest(c.res, ['`url` is required']);
    const sub: WebhookSubscription = {
      id: newId('whk'),
      orgId: c.orgId,
      url,
      secret: newId('whsec'),
      events: Array.isArray(events) && events.length ? events : ['*'],
      active: true,
      createdAt: nowIso(),
    };
    store.webhooks.create(sub);
    return json(c.res, 201, sub);
  });

  r.delete('/api/webhooks/:id', (c) => {
    const sub = store.webhooks.get(c.params.id);
    if (!sub || sub.orgId !== c.orgId) return notFound(c.res, 'Webhook not found');
    store.webhooks.delete(c.params.id);
    return json(c.res, 200, { deleted: true });
  });

  return r;
}
