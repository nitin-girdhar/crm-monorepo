import type { FastifyInstance } from 'fastify';
import {
  createLeadSchema,
  updateLeadSchema,
  updateFollowUpSchema,
  createInteractionSchema,
  createFollowUpSchema,
} from '@crm/validation';
import { RANKS } from '@crm/permissions';
import {
  getLeads,
  getLeadById,
  getLeadTimeline,
  getLeadInteractions,
  getLeadAssignmentHistory,
  getLeadFollowUps,
  listFollowUps,
  getStageOptions,
  getStageOutcomes,
} from '../queries/leads.js';
import { createLead, updateLead, deleteLead, createInteraction } from '../mutations/leads.js';
import { createFollowUp, updateFollowUp, deleteFollowUp } from '../mutations/follow-ups.js';
import { toLeadView } from '../serializers/leads.js';
import { logActivity } from '../activity-logger.js';
import { parseAuthContext } from '../lib/auth-context.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(v: string): boolean {
  return UUID_RE.test(v);
}

export async function leadsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/leads', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id, rank } = ctx;

    const qs = request.query as Record<string, string>;

    // Validate client-supplied org_ids against the user's actual access scope.
    // super_admin/tenant_admin: RLS enforces tenant scope at DB level, allow pass-through.
    // All other roles: ignore supplied org_ids and use only the token's org_id.
    let org_ids: string[] | undefined;
    if (qs['org_ids']) {
      const supplied = qs['org_ids'].split(',').filter(isValidUuid);
      if (role === 'super_admin' || role === 'tenant_admin') {
        org_ids = supplied.length > 0 ? supplied : undefined;
      } else {
        // Scope to caller's own org only; RLS is the DB-side backstop
        org_ids = [org_id];
      }
    }

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
      role,
      tenant_id,
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
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const parsed = createLeadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    try {
      const result = await createLead(org_id, user_id, parsed.data, role, tenant_id);
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
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const qs = request.query as Record<string, string>;
    const pipeline = await listFollowUps(org_id, user_id, {
      assigned_rep_id: qs['assignedRepId'] ?? undefined,
      overdue_only: qs['overdueOnly'] === 'true',
      role,
      tenant_id,
    });
    return reply.status(200).send({ pipeline });
  });

  app.get('/leads/:id', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const lead = await getLeadById(org_id, user_id, id, role, tenant_id);
    if (!lead) return reply.status(404).send({ error: 'Lead not found' });

    return reply.status(200).send({ lead });
  });

  app.patch('/leads/:id', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const parsed = updateLeadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    try {
      const result = await updateLead(org_id, user_id, id, parsed.data, role, tenant_id);
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
      if (msg.includes('hierarchy authority')) return reply.status(403).send({ error: 'You do not have authority to perform this stage transition.' });
      if (msg.includes('outcome_comment is required')) return reply.status(400).send({ error: 'A comment is required for the selected outcome.' });
      if (msg.includes('outcome_id')) return reply.status(400).send({ error: 'Invalid or missing outcome for the selected stage.' });
      throw err;
    }
  });

  app.delete('/leads/:id', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id, rank } = ctx;

    if (rank < RANKS.ADMIN) {
      return reply.status(403).send({ error: 'Only org admins can delete leads.' });
    }

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const body = request.body as Record<string, unknown> | undefined;
    const comment = body?.['comment'] ? String(body['comment']).trim() : '';
    if (!comment) {
      return reply.status(400).send({ error: 'A deletion comment is required.' });
    }

    await deleteLead(org_id, user_id, id, role, tenant_id);
    await logActivity({
      action_type: 'lead_deleted',
      performed_by: user_id,
      lead_id: id,
      new_value: { comment },
    });
    return reply.status(200).send({ ok: true });
  });

  app.get('/leads/:id/timeline', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const events = await getLeadTimeline(org_id, user_id, id, role, tenant_id);
    return reply.status(200).send({ events });
  });

  app.get('/leads/:id/interactions', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const interactions = await getLeadInteractions(org_id, user_id, id, role, tenant_id);
    return reply.status(200).send({ interactions });
  });

  app.post('/leads/:id/interactions', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const parsed = createInteractionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const interaction = await createInteraction(
      org_id,
      user_id,
      id,
      {
        interaction_type_name: parsed.data.interaction_type,
        notes: parsed.data.notes,
        occurred_at: parsed.data.occurred_at,
      },
      role,
      tenant_id,
    );
    await logActivity({ action_type: 'interaction_created', performed_by: user_id, lead_id: id });
    return reply.status(201).send({ interaction });
  });

  app.get('/leads/:id/assignment-history', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const history = await getLeadAssignmentHistory(org_id, user_id, id, role, tenant_id);
    return reply.status(200).send({ history });
  });

  app.get('/leads/:id/follow-ups', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const follow_ups = await getLeadFollowUps(org_id, user_id, id, role, tenant_id);
    return reply.status(200).send({ follow_ups });
  });

  app.post('/leads/:id/follow-ups', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const { id } = request.params as { id: string };
    if (!isValidUuid(id)) return reply.status(400).send({ error: 'Invalid lead id' });

    const parsed = createFollowUpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const follow_up = await createFollowUp(
      org_id,
      user_id,
      id,
      {
        assigned_user_id: parsed.data.assigned_user_id,
        scheduled_at: parsed.data.scheduled_at,
        notes: parsed.data.notes,
      },
      role,
      tenant_id,
    );
    await logActivity({ action_type: 'follow_up_created', performed_by: user_id, lead_id: id });
    return reply.status(201).send({ follow_up });
  });

  app.patch('/leads/:id/follow-ups/:follow_up_id', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const { follow_up_id } = request.params as { id: string; follow_up_id: string };
    if (!isValidUuid(follow_up_id)) return reply.status(400).send({ error: 'Invalid follow_up_id' });

    const parsed = updateFollowUpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { action } = parsed.data;
    let status_name = parsed.data.status_name;
    let completed_at = parsed.data.completed_at;

    if (action === 'complete')   { status_name = 'completed'; completed_at = new Date().toISOString(); }
    if (action === 'reschedule') { status_name = 'pending'; completed_at = undefined; }
    if (action === 'add_note')   { status_name = undefined; }

    const result = await updateFollowUp(org_id, user_id, follow_up_id, {
      status_name,
      completed_at,
      scheduled_at: parsed.data.scheduled_at,
      notes: parsed.data.notes,
    }, role, tenant_id);
    if (!result) return reply.status(404).send({ error: 'Follow-up not found' });
    return reply.status(200).send({ ok: true });
  });

  app.delete('/leads/:id/follow-ups/:follow_up_id', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const { id, follow_up_id } = request.params as { id: string; follow_up_id: string };
    if (!isValidUuid(follow_up_id)) return reply.status(400).send({ error: 'Invalid follow_up_id' });

    await deleteFollowUp(org_id, user_id, follow_up_id, role, tenant_id);
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
