/**
 * VoxDesk server entrypoint.
 *
 * Wires together (all zero-dependency, Node built-ins only):
 *   - HTTP: REST API (bearer auth), Twilio voice webhook, static dashboard
 *   - WebSocket upgrade: Twilio Media Streams -> VoiceSession orchestrator
 *   - Async: webhook delivery worker
 *   - Boot: seed a demo org + agents
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { URL } from 'node:url';

import { env } from './config/env.ts';
import { logger } from './core/logger.ts';
import { DEFAULT_ORG_ID } from './config/constants.ts';
import { randomUUID } from 'node:crypto';
import { parseBody, parseRawBody, json, notFound, text, type Ctx } from './server/http.ts';
import { buildApiRouter } from './api/routes.ts';
import { handleVoiceWebhook } from './telephony/webhook.ts';
import { acceptUpgrade } from './server/wsServer.ts';
import { VoiceSession } from './voice/orchestrator.ts';
import { startWebhookWorker } from './workers/webhooks.ts';
import { startPostCallWorker } from './workers/postCall.ts';
import { seedDemo } from './bootstrap/seed.ts';
import { resolveAuth } from './auth/middleware.ts';
import { isValidTwilioSignature } from './telephony/twilioSignature.ts';
import { handleGoogleCallback, handleOutlookCallback, handleHubSpotCallback } from './api/integrationRoutes.ts';
import { verifyStripeSignature, handleStripeEvent } from './providers/billing/stripe.ts';
import { startConfirmationWorker } from './workers/confirmations.ts';
import { startCrmWorker } from './workers/crm.ts';
import { createOrgRateLimiter } from './server/rateLimit.ts';

/** API paths that do not require authentication. */
const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/auth/signup',
  '/api/auth/login',
  '/api/auth/accept-invite',
  '/api/billing/webhook',
]);

const apiRouter = buildApiRouter();
const PUBLIC_DIR = resolve(process.cwd(), 'public');
const rateLimiter = createOrgRateLimiter(env.rateLimitPerMinute);

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

function unauthorized(res: http.ServerResponse): void {
  json(res, 401, {
    error: 'unauthorized',
    message: 'Provide Authorization: Bearer <session token, API key, or API_ADMIN_TOKEN>',
  });
}

async function serveStatic(pathname: string, res: http.ServerResponse): Promise<void> {
  const rel = pathname === '/' ? '/index.html' : pathname;
  let filePath = join(PUBLIC_DIR, rel);
  // SPA fallback: client routes (login, app, etc.) serve the console.
  if (!filePath.startsWith(PUBLIC_DIR)) return notFound(res);
  if (!existsSync(filePath) || pathname === '/') {
    if (pathname !== '/' && extname(pathname)) return notFound(res);
    filePath = join(PUBLIC_DIR, 'index.html');
  }
  const content = await readFile(filePath);
  const type = MIME[extname(filePath)] || (filePath.endsWith('index.html') ? 'text/html' : 'application/octet-stream');
  res.writeHead(200, { 'Content-Type': type });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  res.setHeader('X-Request-Id', requestId);
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method ?? 'GET';

    // ---- Twilio voice webhook (validated via X-Twilio-Signature, not bearer) ----
    if (pathname === '/telephony/voice') {
      const body = await parseBody(req);
      const params = (body && typeof body === 'object') ? (body as Record<string, string>) : {};
      if (env.twilioAuthToken && env.twilioValidateSignature) {
        const fullUrl = env.publicBaseUrl.replace(/\/$/, '') + (req.url ?? '');
        const valid = isValidTwilioSignature(
          env.twilioAuthToken,
          fullUrl,
          params,
          req.headers['x-twilio-signature'] as string | undefined,
        );
        if (!valid) {
          logger.warn('Rejected Twilio webhook: invalid signature', { requestId });
          return text(res, 403, 'Invalid signature');
        }
      }
      const ctx: Ctx = { req, res, params: {}, query: url.searchParams, body, orgId: DEFAULT_ORG_ID };
      return handleVoiceWebhook(ctx);
    }

    // ---- OAuth callbacks (browser redirect, no bearer) ----
    if (pathname === '/api/integrations/google/callback') {
      const ctx: Ctx = { req, res, params: {}, query: url.searchParams, body: undefined, orgId: '' };
      return await handleGoogleCallback(ctx);
    }
    if (pathname === '/api/integrations/outlook/callback') {
      const ctx: Ctx = { req, res, params: {}, query: url.searchParams, body: undefined, orgId: '' };
      return await handleOutlookCallback(ctx);
    }
    if (pathname === '/api/integrations/hubspot/callback') {
      const ctx: Ctx = { req, res, params: {}, query: url.searchParams, body: undefined, orgId: '' };
      return await handleHubSpotCallback(ctx);
    }

    // ---- Stripe webhook (raw body + signature) ----
    if (pathname === '/api/billing/webhook' && method === 'POST') {
      const raw = await parseRawBody(req);
      if (env.stripeWebhookSecret) {
        const ok = verifyStripeSignature(
          raw,
          req.headers['stripe-signature'] as string | undefined,
          env.stripeWebhookSecret,
        );
        if (!ok) {
          logger.warn('Rejected Stripe webhook: invalid signature', { requestId });
          return json(res, 400, { error: 'invalid_signature' });
        }
      }
      try {
        const event = JSON.parse(raw) as { type: string; data: { object: unknown } };
        handleStripeEvent(event);
        return json(res, 200, { received: true });
      } catch (e) {
        return json(res, 400, { error: 'invalid_payload', message: (e as Error).message });
      }
    }

    // ---- REST API ----
    if (pathname.startsWith('/api/')) {
      const isPublic = PUBLIC_API_PATHS.has(pathname);
      const auth = isPublic ? null : resolveAuth(req);
      if (!isPublic && !auth) return unauthorized(res);

      const limitKey = auth?.orgId || req.socket.remoteAddress || 'anon';
      if (!isPublic && !rateLimiter.allow(limitKey)) {
        res.setHeader('Retry-After', '60');
        return json(res, 429, { error: 'rate_limited', message: 'Too many requests' });
      }

      const match = apiRouter.match(method, pathname);
      if (!match) return notFound(res);
      const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await parseBody(req) : undefined;
      const ctx: Ctx = {
        req,
        res,
        params: match.params,
        query: url.searchParams,
        body,
        orgId: auth?.orgId ?? DEFAULT_ORG_ID,
        userId: auth?.userId,
        role: auth?.role,
        via: auth?.via,
      };
      const result = await match.handler(ctx);
      logger.debug('api', { requestId, method, pathname, ms: Date.now() - started, orgId: ctx.orgId });
      return result;
    }

    // ---- Static dashboard ----
    if (method === 'GET') return await serveStatic(pathname, res);

    notFound(res);
  } catch (e) {
    logger.error('Unhandled request error', { error: (e as Error).message, requestId });
    if (!res.headersSent) json(res, 500, { error: 'internal_error', requestId });
  }
});

// ---- WebSocket upgrade: Twilio Media Streams ----
server.on('upgrade', (req, socket) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (url.pathname === '/telephony/media') {
    const ws = acceptUpgrade(req, socket);
    new VoiceSession(ws, url.searchParams.get('token') ?? undefined);
    logger.info('Media stream connected');
  } else {
    socket.destroy();
  }
});

// ---- Boot ----
seedDemo();
startWebhookWorker();
startPostCallWorker();
startConfirmationWorker();
startCrmWorker();
server.listen(env.port, () => {
  logger.info('VoxDesk listening', {
    port: env.port,
    dashboard: `${env.publicBaseUrl}/?token=${env.apiAdminToken}`,
    openai: env.openaiApiKey ? 'configured' : 'MISSING',
    twilio: env.twilioAccountSid ? 'configured' : 'MISSING',
  });
});
