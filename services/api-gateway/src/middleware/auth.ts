import type { FastifyRequest, FastifyReply } from 'fastify';
import { AUTH_COOKIE_NAME } from '@crm/auth-constants';
import type { JwtPayload } from '@crm/types';
import { verifyJwtEdge } from '../lib/jwt-verify.js';
import type { UserContext } from '../lib/proxy.js';

declare module 'fastify' {
  interface FastifyRequest {
    userCtx?: UserContext;
  }
}

export async function authPreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies[AUTH_COOKIE_NAME] ?? extractBearerToken(request);

  if (!token) {
    return reply.status(401).send({ error: 'Not authenticated' });
  }

  const result = await verifyJwtEdge(token);
  if (!result.ok) {
    const message = result.reason === 'expired' ? 'Session expired' : 'Invalid token';
    return reply.status(401).send({ error: message });
  }

  const payload = result.payload as JwtPayload;
  request.userCtx = {
    user_id: payload.sub,
    user_role: payload.role,
    org_id: payload.org_id,
    rank: String(payload.rank),
  };
}

function extractBearerToken(request: FastifyRequest): string | undefined {
  const auth = request.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return undefined;
}
