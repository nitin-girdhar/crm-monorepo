import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../lib/errors.js';

const INTERNAL_SECRET = process.env['INTERNAL_SERVICE_SECRET'];

export async function authenticate(request: FastifyRequest): Promise<void> {
  const secret = request.headers['x-internal-secret'] as string | undefined;
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    throw new UnauthorizedError('Unauthorized');
  }

  const org_id  = request.headers['x-org-id']  as string | undefined;
  const user_id = request.headers['x-user-id'] as string | undefined;
  const role    = request.headers['x-user-role'] as string | undefined;

  if (!org_id || !user_id || !role) throw new UnauthorizedError('Missing auth headers');

  request.auth = {
    org_id,
    user_id,
    role,
    tenant_id: (request.headers['x-tenant-id']  as string) || '',
    rank:      parseInt((request.headers['x-rank'] as string) ?? '0', 10),
  };
}
