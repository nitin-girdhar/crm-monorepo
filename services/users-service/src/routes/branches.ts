import type { FastifyInstance } from 'fastify';
import { getBranches, getAllBranches, getLeadSources } from '../queries/users.js';

export async function branchesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/branches', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    const role = (request.headers['x-user-role'] as string) || 'org_admin';
    const tenant_id = (request.headers['x-tenant-id'] as string) || '';
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const qs = request.query as Record<string, string>;
    const cityIds    = qs['cityIds']    ? qs['cityIds'].split(',').map(Number).filter(Boolean)    : [];
    const stateIds   = qs['stateIds']   ? qs['stateIds'].split(',').map(Number).filter(Boolean)   : [];
    const countryIds = qs['countryIds'] ? qs['countryIds'].split(',').map(Number).filter(Boolean) : [];

    const branches = await getBranches(org_id, user_id, role, tenant_id, { cityIds, stateIds, countryIds });
    return reply.status(200).send(branches);
  });

  app.get('/branches/all', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    const role = (request.headers['x-user-role'] as string) || 'org_admin';
    const tenant_id = (request.headers['x-tenant-id'] as string) || '';
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const branches = await getAllBranches(org_id, user_id, role, tenant_id);
    return reply.status(200).send(branches);
  });

  app.get('/lead-sources', async (_request, reply) => {
    const sources = await getLeadSources();
    return reply.status(200).send(sources);
  });
}
