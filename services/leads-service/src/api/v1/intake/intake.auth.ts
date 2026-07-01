import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../../../lib/errors.js';
import { resolveOrgFromApiKey } from './intake.repository.js';

const INTERNAL_SECRET = process.env['INTERNAL_SERVICE_SECRET'];

declare module 'fastify' {
  interface FastifyRequest {
    intakeOrgId?: string;
  }
}

// Used by internal service-to-service intake calls (meta webhook, service calls).
// Requires only the shared internal secret; org_id comes from the request body.
export async function authenticateInternal(request: FastifyRequest): Promise<void> {
  const secret = request.headers['x-internal-secret'] as string | undefined;
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    throw new UnauthorizedError('Unauthorized');
  }
}

// Used by the public website intake endpoint.
// Requires both the internal secret (injected by gateway) and a per-org API key.
// Resolves and attaches the org_id so the controller does not trust the request body.
export async function authenticateApiKey(request: FastifyRequest): Promise<void> {
  const secret = request.headers['x-internal-secret'] as string | undefined;
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    throw new UnauthorizedError('Unauthorized');
  }

  const apiKey = request.headers['x-api-key'] as string | undefined;
  if (!apiKey) throw new UnauthorizedError('X-Api-Key header is required');

  request.intakeOrgId = await resolveOrgFromApiKey(apiKey);
}
