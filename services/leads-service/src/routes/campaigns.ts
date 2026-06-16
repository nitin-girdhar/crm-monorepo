import type { FastifyInstance } from 'fastify';
import { listCampaigns, getCampaignById } from '../queries/campaigns.js';
import { createCampaign, updateCampaign, deleteCampaign } from '../mutations/campaigns.js';
import { logActivity } from '../activity-logger.js';

export async function campaignsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/campaigns', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const campaigns = await listCampaigns(org_id, user_id);
    return reply.status(200).send({ campaigns });
  });

  app.post('/campaigns', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const body = request.body as Record<string, unknown>;
    try {
      const result = await createCampaign(org_id, user_id, body);
      await logActivity({ action_type: 'campaign_created', performed_by: user_id });
      return reply.status(201).send({ campaign: { id: result.id } });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('lookup not found')) return reply.status(400).send({ error: msg });
      throw err;
    }
  });

  app.get('/campaigns/:id', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const { id } = request.params as { id: string };
    const campaign = await getCampaignById(org_id, user_id, id);
    if (!campaign) return reply.status(404).send({ error: 'Campaign not found' });
    return reply.status(200).send({ campaign });
  });

  app.patch('/campaigns/:id', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    try {
      const result = await updateCampaign(org_id, user_id, id, body);
      if (!result) return reply.status(404).send({ error: 'Campaign not found' });
      await logActivity({ action_type: 'campaign_updated', performed_by: user_id });
      return reply.status(200).send({ ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('lookup not found')) return reply.status(400).send({ error: msg });
      throw err;
    }
  });

  app.delete('/campaigns/:id', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const { id } = request.params as { id: string };
    await deleteCampaign(org_id, user_id, id);
    await logActivity({ action_type: 'campaign_deleted', performed_by: user_id });
    return reply.status(200).send({ ok: true });
  });
}
