import { Readable } from 'node:stream';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { IncomingMessage } from 'node:http';
import { config } from '../config.js';

export interface UserContext {
  user_id: string;
  user_role: string;
  org_id: string;
  rank: string;
  tenant_id?: string;
}

export interface ProxyOptions {
  forwardCookies?: boolean;
}

export async function proxyTo(
  targetUrl: string,
  path: string,
  request: FastifyRequest,
  reply: FastifyReply,
  userCtx?: UserContext,
  options?: ProxyOptions,
): Promise<void> {
  const url = new URL(path, targetUrl);

  const rawQuery = (request.raw.url ?? '').split('?')[1];
  if (rawQuery) url.search = rawQuery;

  const forwardHeaders: Record<string, string> = {
    'Content-Type': request.headers['content-type'] ?? 'application/json',
    // Always inject the inter-service secret so downstream services can verify origin
    'X-Internal-Secret': config.serviceSecret,
  };

  if (userCtx) {
    forwardHeaders['X-User-Id'] = userCtx.user_id;
    forwardHeaders['X-User-Role'] = userCtx.user_role;
    forwardHeaders['X-Org-Id'] = userCtx.org_id;
    forwardHeaders['X-Rank'] = userCtx.rank;
    if (userCtx.tenant_id) forwardHeaders['X-Tenant-Id'] = userCtx.tenant_id;
  }

  if (options?.forwardCookies && request.headers['cookie']) {
    forwardHeaders['Cookie'] = request.headers['cookie'] as string;
  }

  const method = request.method.toUpperCase();
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);

  let body: string | undefined;
  if (hasBody && request.body !== undefined) {
    body = JSON.stringify(request.body);
  }

  try {
    const upstream = await fetch(url.toString(), {
      method,
      headers: forwardHeaders,
      ...(body !== undefined ? { body } : {}),
    });

    const setCookie = upstream.headers.get('set-cookie');
    if (setCookie) reply.header('Set-Cookie', setCookie);
    reply.header('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    reply.status(upstream.status);

    if (upstream.body) {
      return reply.send(Readable.fromWeb(upstream.body as ReadableStream<Uint8Array>));
    }
    return reply.send('');
  } catch {
    return reply.status(502).send(JSON.stringify({ error: 'Upstream service unavailable' }));
  }
}

/**
 * Raw-body proxy: streams the original request body byte-for-byte to the
 * upstream service. Required for Meta webhooks where the downstream service
 * needs the unmodified bytes for HMAC-SHA256 verification.
 */
export async function proxyToRaw(
  targetUrl: string,
  path: string,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const url = new URL(path, targetUrl);

  const rawQuery = (request.raw.url ?? '').split('?')[1];
  if (rawQuery) url.search = rawQuery;

  const forwardHeaders: Record<string, string> = {
    'Content-Type': request.headers['content-type'] ?? 'application/json',
    'X-Internal-Secret': config.serviceSecret,
  };

  // Forward Meta's signature header for HMAC verification downstream
  const sig = request.headers['x-hub-signature-256'];
  if (typeof sig === 'string') forwardHeaders['X-Hub-Signature-256'] = sig;

  try {
    // Collect raw bytes from the incoming request stream
    const chunks: Buffer[] = [];
    const raw: IncomingMessage = request.raw;
    for await (const chunk of raw) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks);

    const fetchInit: RequestInit = {
      method: request.method,
      headers: forwardHeaders,
    };
    if (rawBody.length > 0) fetchInit.body = rawBody;

    const upstream = await fetch(url.toString(), fetchInit);

    reply.header('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    reply.status(upstream.status);

    if (upstream.body) {
      return reply.send(Readable.fromWeb(upstream.body as ReadableStream<Uint8Array>));
    }
    return reply.send('');
  } catch {
    return reply.status(502).send(JSON.stringify({ error: 'Upstream service unavailable' }));
  }
}
