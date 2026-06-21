import type { FastifyInstance } from 'fastify';
import { RANKS } from '@crm/permissions';
import { createCampaignSchema, updateCampaignSchema } from '@crm/validation';
import { listCampaigns, getCampaignById } from '../queries/campaigns.js';
import { createCampaign, updateCampaign, deleteCampaign } from '../mutations/campaigns.js';
import { logActivity } from '../activity-logger.js';
import { parseAuthContext } from '../lib/auth-context.js';

export async function campaignsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/campaigns', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const campaigns = await listCampaigns(org_id, user_id, role, tenant_id);
    return reply.status(200).send({ campaigns });
  });

  app.post('/campaigns', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id, rank } = ctx;

    if (rank < RANKS.ADMIN) {
      return reply.status(403).send({ error: 'Only org admins can create campaigns.' });
    }

    const parsed = createCampaignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    try {
      const result = await createCampaign(org_id, user_id, parsed.data, role, tenant_id);
      await logActivity({ action_type: 'campaign_created', performed_by: user_id });
      return reply.status(201).send({ campaign: { id: result.id } });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('lookup not found')) return reply.status(400).send({ error: 'Invalid platform or status value.' });
      throw err;
    }
  });

  app.get('/campaigns/:id', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const { id } = request.params as { id: string };
    const campaign = await getCampaignById(org_id, user_id, id, role, tenant_id);
    if (!campaign) return reply.status(404).send({ error: 'Campaign not found' });
    return reply.status(200).send({ campaign });
  });

  app.patch('/campaigns/:id', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id, rank } = ctx;

    if (rank < RANKS.ADMIN) {
      return reply.status(403).send({ error: 'Only org admins can update campaigns.' });
    }

    const { id } = request.params as { id: string };
    const parsed = updateCampaignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    try {
      const result = await updateCampaign(org_id, user_id, id, parsed.data, role, tenant_id);
      if (!result) return reply.status(404).send({ error: 'Campaign not found' });
      await logActivity({ action_type: 'campaign_updated', performed_by: user_id });
      return reply.status(200).send({ ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('lookup not found')) return reply.status(400).send({ error: 'Invalid platform or status value.' });
      throw err;
    }
  });

  app.delete('/campaigns/:id', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id, rank } = ctx;

    if (rank < RANKS.ADMIN) {
      return reply.status(403).send({ error: 'Only org admins can delete campaigns.' });
    }

    const { id } = request.params as { id: string };
    await deleteCampaign(org_id, user_id, id, role, tenant_id);
    await logActivity({ action_type: 'campaign_deleted', performed_by: user_id });
    return reply.status(200).send({ ok: true });
  });
}
