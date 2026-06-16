import type { FastifyInstance } from 'fastify';
import { createLeadSchema, updateLeadSchema } from '@crm/validation';
import { getLeads, getLeadById, getLeadTimeline, getLeadInteractions, getLeadAssignmentHistory, getLeadFollowUps, listFollowUps, getStageOptions, getStageOutcomes } from '../queries/leads.js';
import { createLead, updateLead, deleteLead, createInteraction } from '../mutations/leads.js';
import { createFollowUp, updateFollowUp, deleteFollowUp } from '../mutations/follow-ups.js';
import { toLeadView } from '../serializers/leads.js';
import { logActivity } from '../activity-logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(v: string): boolean {
  return UUID_RE.test(v);
}

export async function leadsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/leads', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    const rank = parseInt(request.headers['x-rank'] as string ?? '0', 10);
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const qs = request.query as Record<string, string>;
    const org_ids = qs['org_ids'] ? qs['org_ids'].split(',').filter(Boolean) : undefined;

    const result = await getLeads(org_id, user_id, {
      status: qs['status'],
      assigned_to: qs['assigned_to'],
      assigned_user_id: qs['assigned_user_id'],
      campaign_id: qs['campaign_id'],
      search: qs['search'],
      platforms: qs['platforms'] ? qs['platforms'].split(',') : undefined,
      page: qs['page'] ? parseInt(qs['page'], 10) : 1,
      page_size: qs['page_size'] ? parseInt(qs['page_size'], 10) : 50,
      org_ids,
      actor_rank: rank,
    });

    const leads = (result.leads as Record<string, unknown>[]).map(toLeadView);

    return reply.status(200).send({
      leads,
      total: result.total,
      page: result.page,
      page_size: result.page_size,
      stage_options: result.stage_options,
      stage_outcomes: result.stage_outcomes,
    });
  });

  app.post('/leads', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const parsed = createLeadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    try {
      const result = await createLead(org_id, user_id, parsed.data);
      await logActivity({ action_type: 'lead_created', performed_by: user_id, lead_id: result.id });
      return reply.status(201).send({ lead: { id: result.id } });
    } catch (err) {
      const e = err as Error & { field?: string };
      if (e.field === 'phone') return reply.status(409).send({ error: 'A lead with this phone already exists.' });
      if (e.field === 'email') return reply.status(409).send({ error: 'A lead with this email already exists.' });
      throw err;
    }
  });

  app.get('/follow-ups', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const qs = request.query as Record<string, string>;
    const pipeline = await listFollowUps(org_id, user_id, {
      assigned_rep_id: qs['assignedRepId'] ?? undefined,
      overdue_only: qs['overdueOnly'] === 'true',
    });
    return reply.status(200).send({ pipeline });
  });

  app.get('/leads/:id', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const lead = await getLeadById(org_id, user_id, id);
    if (!lead) return reply.status(404).send({ error: 'Lead not found' });

    return reply.status(200).send({ lead });
  });

  app.patch('/leads/:id', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const parsed = updateLeadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    try {
      const result = await updateLead(org_id, user_id, id, parsed.data);
      if (!result) return reply.status(404).send({ error: 'Lead not found' });

      if (parsed.data.stage_id) {
        await logActivity({
          action_type: 'status_change',
          performed_by: user_id,
          lead_id: id,
          new_value: { stage_id: parsed.data.stage_id, outcome_id: parsed.data.outcome_id },
        });
      }

      return reply.status(200).send({ ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('hierarchy authority')) return reply.status(403).send({ error: msg });
      if (msg.includes('outcome_comment is required')) return reply.status(400).send({ error: msg });
      if (msg.includes('outcome_id')) return reply.status(400).send({ error: msg });
      throw err;
    }
  });

  app.delete('/leads/:id', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    await deleteLead(org_id, user_id, id);
    await logActivity({ action_type: 'lead_deleted', performed_by: user_id, lead_id: id });
    return reply.status(200).send({ ok: true });
  });

  app.get('/leads/:id/timeline', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const events = await getLeadTimeline(org_id, user_id, id);
    return reply.status(200).send({ events });
  });

  app.get('/leads/:id/interactions', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const interactions = await getLeadInteractions(org_id, user_id, id);
    return reply.status(200).send({ interactions });
  });

  app.post('/leads/:id/interactions', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const body = request.body as Record<string, unknown>;

    const interaction = await createInteraction(org_id, user_id, id, {
      interaction_type_name: body['interaction_type'] ? String(body['interaction_type']) : undefined,
      notes: body['notes'] ? String(body['notes']) : undefined,
      occurred_at: body['occurred_at'] ? String(body['occurred_at']) : undefined,
    });
    await logActivity({ action_type: 'interaction_created', performed_by: user_id, lead_id: id });
    return reply.status(201).send({ interaction });
  });

  app.get('/leads/:id/assignment-history', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const history = await getLeadAssignmentHistory(org_id, user_id, id);
    return reply.status(200).send({ history });
  });

  app.get('/leads/:id/follow-ups', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const follow_ups = await getLeadFollowUps(org_id, user_id, id);
    return reply.status(200).send({ follow_ups });
  });

  app.post('/leads/:id/follow-ups', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const body = request.body as Record<string, unknown>;
    if (!body['scheduled_at']) {
      return reply.status(400).send({ error: 'scheduled_at is required' });
    }

    const follow_up = await createFollowUp(org_id, user_id, id, {
      assigned_user_id: body['assigned_user_id'] ? String(body['assigned_user_id']) : undefined,
      scheduled_at: String(body['scheduled_at']),
      notes: body['notes'] ? String(body['notes']) : undefined,
    });
    await logActivity({ action_type: 'follow_up_created', performed_by: user_id, lead_id: id });
    return reply.status(201).send({ follow_up });
  });

  app.patch('/leads/:id/follow-ups/:follow_up_id', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const { follow_up_id } = request.params as { id: string; follow_up_id: string };
    if (!isValidUuid(follow_up_id)) return reply.status(400).send({ error: 'Invalid follow_up_id' });

    const body = request.body as Record<string, unknown>;

    const action = body['action'] ? String(body['action']) : undefined;
    let status_name = body['status_name'] ? String(body['status_name']) : undefined;
    let completed_at = body['completed_at'] ? String(body['completed_at']) : undefined;
    let scheduled_at = body['scheduledAt'] ? String(body['scheduledAt']) : undefined;
    if (action === 'complete')   { status_name = 'completed'; completed_at = new Date().toISOString(); }
    if (action === 'reschedule') { status_name = 'pending'; }
    if (action === 'add_note')   { status_name = undefined; }

    const result = await updateFollowUp(org_id, user_id, follow_up_id, {
      status_name,
      completed_at,
      scheduled_at,
      notes: body['notes'] ? String(body['notes']) : undefined,
    });
    if (!result) return reply.status(404).send({ error: 'Follow-up not found' });
    return reply.status(200).send({ ok: true });
  });

  app.delete('/leads/:id/follow-ups/:follow_up_id', async (request, reply) => {
    const org_id = request.headers['x-org-id'] as string;
    const user_id = request.headers['x-user-id'] as string;
    if (!org_id || !user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const { id, follow_up_id } = request.params as { id: string; follow_up_id: string };
    if (!isValidUuid(follow_up_id)) return reply.status(400).send({ error: 'Invalid follow_up_id' });

    await deleteFollowUp(org_id, user_id, follow_up_id);
    await logActivity({ action_type: 'follow_up_deleted', performed_by: user_id, lead_id: id });
    return reply.status(200).send({ ok: true });
  });

  app.get('/lookups/lead-stages', async (_request, reply) => {
    const stages = await getStageOptions();
    return reply.status(200).send(stages);
  });

  app.get('/lookups/lead-stage-outcomes', async (request, reply) => {
    const qs = request.query as Record<string, string>;
    const stage_id = qs['stage_id'] ?? undefined;
    const outcomes = await getStageOutcomes(stage_id);
    return reply.status(200).send(outcomes);
  });
}
