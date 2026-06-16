import type { FastifyInstance } from 'fastify';
import { RANKS } from '@crm/permissions';
import {
  getOrgPerformanceSnapshot,
  getTenantDashboard,
  getTenantCampaignSummary,
  getPipelineByStage,
} from '../queries/analytics.js';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/analytics/dashboard', async (request, reply) => {
    const user_id = request.headers['x-user-id'] as string;
    const org_id = request.headers['x-org-id'] as string;
    const role = (request.headers['x-user-role'] as string) ?? '';
    const rank = parseInt((request.headers['x-rank'] as string) ?? '0', 10);
    if (!user_id || !org_id) return reply.status(401).send({ error: 'Missing auth headers' });

    if (rank < RANKS.ADMIN) {
      return reply.status(403).send({ error: 'Access restricted to administrators' });
    }

    const is_tenant_wide = role === 'super_admin' || role === 'tenant_admin';

    if (is_tenant_wide) {
      const data = await getTenantDashboard(org_id, user_id);
      return reply.status(200).send(data);
    }

    const data = await getOrgPerformanceSnapshot(org_id, user_id);
    return reply.status(200).send(data);
  });

  app.get('/analytics/dashboard/campaigns', async (request, reply) => {
    const user_id = request.headers['x-user-id'] as string;
    const org_id = request.headers['x-org-id'] as string;
    const rank = parseInt((request.headers['x-rank'] as string) ?? '0', 10);
    if (!user_id || !org_id) return reply.status(401).send({ error: 'Missing auth headers' });

    if (rank < RANKS.ADMIN) {
      return reply.status(403).send({ error: 'Access restricted to administrators' });
    }

    const data = await getTenantCampaignSummary(org_id, user_id);
    return reply.status(200).send(data);
  });

  app.get('/analytics/performance', async (request, reply) => {
    const user_id = request.headers['x-user-id'] as string;
    const org_id = request.headers['x-org-id'] as string;
    if (!user_id || !org_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const snapshot = await getOrgPerformanceSnapshot(org_id, user_id);
    return reply.status(200).send(snapshot);
  });

  app.get('/analytics/pipeline', async (request, reply) => {
    const user_id = request.headers['x-user-id'] as string;
    const org_id = request.headers['x-org-id'] as string;
    if (!user_id || !org_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const pipeline = await getPipelineByStage(org_id, user_id);
    return reply.status(200).send(pipeline);
  });
}
