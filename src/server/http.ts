/**
 * Tiny HTTP framework (zero-dependency) over node:http.
 *
 * Provides path-param routing, JSON + urlencoded body parsing, and small helper
 * responses. Enough to serve the REST API, the Twilio webhook, and static
 * dashboard files without a framework dependency.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  /** Tenant scope resolved by auth (defaults to the demo org). */
  orgId: string;
}

export type Handler = (ctx: Ctx) => void | Promise<void>;
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface Route {
  method: Method;
  segments: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  add(method: Method, path: string, handler: Handler): void {
    this.routes.push({ method, segments: path.split('/').filter(Boolean), handler });
  }
  get(path: string, handler: Handler) { this.add('GET', path, handler); }
  post(path: string, handler: Handler) { this.add('POST', path, handler); }
  put(path: string, handler: Handler) { this.add('PUT', path, handler); }
  delete(path: string, handler: Handler) { this.add('DELETE', path, handler); }

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
    const parts = pathname.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]);
        else if (seg !== parts[i]) { ok = false; break; }
      }
      if (ok) return { handler: route.handler, params };
    }
    return null;
  }
}

export function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

export function text(res: ServerResponse, status: number, body: string, contentType = 'text/plain'): void {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

export function badRequest(res: ServerResponse, errors: string[]): void {
  json(res, 400, { error: 'validation_error', details: errors });
}

export function notFound(res: ServerResponse, msg = 'Not found'): void {
  json(res, 404, { error: 'not_found', message: msg });
}

/** Read and parse the request body (JSON or urlencoded). */
export async function parseBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8');
  const type = req.headers['content-type'] ?? '';
  if (type.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return undefined; }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return raw;
}
