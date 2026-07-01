import { Readable } from 'node:stream';
import type { FastifyRequest, FastifyReply } from 'fastify';
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
  extraHeaders?: Record<string, string>;
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

  if (options?.extraHeaders) {
    Object.assign(forwardHeaders, options.extraHeaders);
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
 * SSE proxy: opens a long-lived connection to an upstream SSE endpoint and
 * streams events back to the client without buffering. Used for real-time
 * notifications where the gateway must keep the connection open indefinitely.
 */
export async function proxySSE(
  targetUrl: string,
  path: string,
  request: FastifyRequest,
  reply: FastifyReply,
  userCtx?: UserContext,
): Promise<void> {
  const url = new URL(path, targetUrl);

  const forwardHeaders: Record<string, string> = {
    'Accept': 'text/event-stream',
    'X-Internal-Secret': config.serviceSecret,
  };

  if (userCtx) {
    forwardHeaders['X-User-Id'] = userCtx.user_id;
    forwardHeaders['X-User-Role'] = userCtx.user_role;
    forwardHeaders['X-Org-Id'] = userCtx.org_id;
    forwardHeaders['X-Rank'] = userCtx.rank;
    if (userCtx.tenant_id) forwardHeaders['X-Tenant-Id'] = userCtx.tenant_id;
  }

  try {
    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: forwardHeaders,
    });

    reply.hijack();

    // Disable socket timeouts — SSE connections must stay open indefinitely
    request.raw.socket.setTimeout(0);
    request.raw.socket.setKeepAlive(true, 30_000);

    const origin = request.headers.origin ?? '';
    const allowedOrigin = origin === config.webUrl ? origin : '';
    reply.raw.writeHead(upstream.status, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...(allowedOrigin ? {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Credentials': 'true',
      } : {}),
    });

    if (upstream.body) {
      const reader = (upstream.body as ReadableStream<Uint8Array>).getReader();

      request.raw.on('close', () => {
        reader.cancel().catch(() => {});
      });

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            reply.raw.write(value);
          }
        } catch {
          // Client disconnected or upstream closed
        } finally {
          reply.raw.end();
        }
      })();
    }
  } catch {
    if (!reply.raw.headersSent) {
      return reply.status(502).send(JSON.stringify({ error: 'Upstream service unavailable' }));
    }
  }
}

/**
 * Raw-body proxy: forwards the original request body byte-for-byte to the
 * upstream service. Required for Meta webhooks where the downstream service
 * needs the unmodified bytes for HMAC-SHA256 verification.
 *
 * Relies on the gateway's custom content-type parser storing `rawBody` on the
 * request before the route handler runs.
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
    const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;

    const fetchInit: RequestInit = {
      method: request.method,
      headers: forwardHeaders,
    };
    if (rawBody && rawBody.length > 0) fetchInit.body = rawBody;

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
