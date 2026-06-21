import type { FastifyInstance } from 'fastify';
import { getBranches, getAllBranches, getLeadSources } from '../queries/users.js';
import { parseAuthContext } from '../lib/auth-context.js';

export async function branchesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/branches', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const qs = request.query as Record<string, string>;
    const cityIds    = qs['cityIds']    ? qs['cityIds'].split(',').map(Number).filter(Boolean)    : [];
    const stateIds   = qs['stateIds']   ? qs['stateIds'].split(',').map(Number).filter(Boolean)   : [];
    const countryIds = qs['countryIds'] ? qs['countryIds'].split(',').map(Number).filter(Boolean) : [];

    const branches = await getBranches(org_id, user_id, role, tenant_id, { cityIds, stateIds, countryIds });
    return reply.status(200).send(branches);
  });

  app.get('/branches/all', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const branches = await getAllBranches(org_id, user_id, role, tenant_id);
    return reply.status(200).send(branches);
  });

  app.get('/lead-sources', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const sources = await getLeadSources();
    return reply.status(200).send(sources);
  });
}
