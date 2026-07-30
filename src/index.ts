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
import {
  parseBody,
  json,
  notFound,
  text,
  type Ctx,
} from './server/http.ts';
import { buildApiRouter } from './api/routes.ts';
import { handleVoiceWebhook } from './telephony/webhook.ts';
import { acceptUpgrade } from './server/wsServer.ts';
import { VoiceSession } from './voice/orchestrator.ts';
import { startWebhookWorker } from './workers/webhooks.ts';
import { seedDemo } from './bootstrap/seed.ts';

const apiRouter = buildApiRouter();
const PUBLIC_DIR = resolve(process.cwd(), 'public');

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

function unauthorized(res: http.ServerResponse): void {
  json(res, 401, { error: 'unauthorized', message: 'Provide Authorization: Bearer <API_ADMIN_TOKEN>' });
}

async function serveStatic(pathname: string, res: http.ServerResponse): Promise<void> {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) return notFound(res);
  const content = await readFile(filePath);
  const type = MIME[extname(filePath)] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method ?? 'GET';

    // ---- Twilio voice webhook (no bearer auth; Twilio-signed in production) ----
    if (pathname === '/telephony/voice') {
      const body = await parseBody(req);
      const ctx: Ctx = { req, res, params: {}, query: url.searchParams, body, orgId: DEFAULT_ORG_ID };
      return handleVoiceWebhook(ctx);
    }

    // ---- REST API ----
    if (pathname.startsWith('/api/')) {
      // Public endpoints: health.
      const isPublic = pathname === '/api/health';
      if (!isPublic) {
        const auth = req.headers['authorization'] ?? '';
        if (auth !== `Bearer ${env.apiAdminToken}`) return unauthorized(res);
      }
      const match = apiRouter.match(method, pathname);
      if (!match) return notFound(res);
      const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await parseBody(req) : undefined;
      const orgId = (req.headers['x-org-id'] as string) || DEFAULT_ORG_ID;
      const ctx: Ctx = { req, res, params: match.params, query: url.searchParams, body, orgId };
      return await match.handler(ctx);
    }

    // ---- Static dashboard ----
    if (method === 'GET') return await serveStatic(pathname, res);

    notFound(res);
  } catch (e) {
    logger.error('Unhandled request error', { error: (e as Error).message });
    if (!res.headersSent) json(res, 500, { error: 'internal_error' });
  }
});

// ---- WebSocket upgrade: Twilio Media Streams ----
server.on('upgrade', (req, socket) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (url.pathname === '/telephony/media') {
    const ws = acceptUpgrade(req, socket);
    new VoiceSession(ws);
    logger.info('Media stream connected');
  } else {
    socket.destroy();
  }
});

// ---- Boot ----
seedDemo();
startWebhookWorker();
server.listen(env.port, () => {
  logger.info('VoxDesk listening', {
    port: env.port,
    dashboard: `${env.publicBaseUrl}/?token=${env.apiAdminToken}`,
    openai: env.openaiApiKey ? 'configured' : 'MISSING',
    twilio: env.twilioAccountSid ? 'configured' : 'MISSING',
  });
});
