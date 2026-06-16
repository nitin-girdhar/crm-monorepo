import type { FastifyRequest, FastifyReply } from 'fastify';

export interface UserContext {
  user_id: string;
  user_role: string;
  org_id: string;
  rank: string;
  tenant_id?: string;
}

export async function proxyTo(
  targetUrl: string,
  path: string,
  request: FastifyRequest,
  reply: FastifyReply,
  userCtx?: UserContext,
): Promise<void> {
  const url = new URL(path, targetUrl);

  const rawQuery = (request.raw.url ?? '').split('?')[1];
  if (rawQuery) url.search = rawQuery;

  const forwardHeaders: Record<string, string> = {
    'Content-Type': request.headers['content-type'] ?? 'application/json',
  };

  if (userCtx) {
    forwardHeaders['X-User-Id'] = userCtx.user_id;
    forwardHeaders['X-User-Role'] = userCtx.user_role;
    forwardHeaders['X-Org-Id'] = userCtx.org_id;
    forwardHeaders['X-Rank'] = userCtx.rank;
    if (userCtx.tenant_id) forwardHeaders['X-Tenant-Id'] = userCtx.tenant_id;
  }

  if (request.headers['cookie']) {
    forwardHeaders['Cookie'] = request.headers['cookie'];
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
    if (setCookie) {
      reply.header('Set-Cookie', setCookie);
    }
    reply.header('Content-Type', upstream.headers.get('content-type') ?? 'application/json');

    const responseText = await upstream.text();
    return reply.status(upstream.status).send(responseText);
  } catch {
    return reply.status(502).send(JSON.stringify({ error: 'Upstream service unavailable' }));
  }
}
