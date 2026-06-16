import type { FastifyInstance } from 'fastify';
import { RANKS, canAssignToUser } from '@crm/permissions';
import { createAssignmentSchema, updateAssignmentSchema } from '@crm/validation';
import {
  listAllAssignments,
  listMyAssignments,
  getAssignmentById,
  getUserByIdForAssignment,
} from '../queries/assignments.js';
import {
  assignLead,
  reassignLead,
  unassignLead,
} from '../mutations/assignments.js';
import { toAssignmentView } from '../serializers/assignments.js';
import { logActivity } from '../activity-logger.js';

export async function assignmentsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/assignments', async (request, reply) => {
    const user_id = request.headers['x-user-id'] as string;
    const org_id = request.headers['x-org-id'] as string;
    const role = (request.headers['x-user-role'] as string) ?? '';
    if (!user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const qs = request.query as Record<string, string>;
    const page = qs['page'] ? parseInt(qs['page'], 10) : 1;
    const page_size = Math.min(qs['page_size'] ? parseInt(qs['page_size'], 10) : 100, 500);

    const MULTI_ORG_ROLES = new Set(['super_admin', 'tenant_admin']);
    const org_ids = MULTI_ORG_ROLES.has(role) ? null : [org_id];

    const result = await listAllAssignments(org_ids, page, page_size);
    const assignments = (result.assignments as Record<string, unknown>[]).map(toAssignmentView);
    return reply.status(200).send({ assignments, total: result.total, page: result.page, page_size: result.page_size });
  });

  app.post('/assignments', async (request, reply) => {
    const user_id = request.headers['x-user-id'] as string;
    const user_rank = parseInt(request.headers['x-rank'] as string ?? '0', 10);
    const org_id = request.headers['x-org-id'] as string;
    if (!user_id || !org_id) return reply.status(401).send({ error: 'Missing auth headers' });

    if (user_rank < RANKS.SSE) {
      return reply.status(403).send({ error: 'Insufficient permissions to create assignments' });
    }

    const parsed = createAssignmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }
    const input = parsed.data;

    const target_user = await getUserByIdForAssignment(org_id, user_id, input.assigned_to);
    if (!target_user || !target_user['is_active']) {
      return reply.status(400).send({ error: 'Target user not found or inactive' });
    }

    const target_rank = Number(target_user['rank'] ?? 0);
    if (!canAssignToUser(user_rank, target_rank, user_id, String(target_user['id']))) {
      const reason = target_rank >= RANKS.ADMIN
        ? 'Admin users cannot be lead assignees'
        : user_id === String(target_user['id'])
          ? 'You cannot assign a lead to yourself'
          : 'You cannot assign leads to a user with that role';

      await logActivity({
        action_type: 'privilege_denied_attempt',
        performed_by: user_id,
        lead_id: input.lead_id,
        new_value: { reason, target_id: target_user['id'], target_role: target_user['role_name'] },
      });

      return reply.status(403).send({ error: reason });
    }

    try {
      const result = await assignLead({
        lead_id: input.lead_id,
        branch: input.branch ?? '',
        assigned_to: input.assigned_to,
        assigned_by: user_id,
        notes: input.notes ?? null,
      });

      await logActivity({
        action_type: 'assignment_created',
        performed_by: user_id,
        lead_id: input.lead_id,
        new_value: { assigned_to: input.assigned_to },
      });

      return reply.status(201).send({ assignment: toAssignmentView(result as Record<string, unknown>) });
    } catch (err) {
      if ((err as Error & { code?: string }).code === '23505' || (err as Error).message.includes('already assigned')) {
        return reply.status(409).send({ error: 'This lead is already assigned. Use PATCH to reassign.' });
      }
      throw err;
    }
  });

  app.get('/assignments/mine', async (request, reply) => {
    const user_id = request.headers['x-user-id'] as string;
    const org_id = request.headers['x-org-id'] as string;
    if (!user_id || !org_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const qs = request.query as Record<string, string>;
    const page = qs['page'] ? parseInt(qs['page'], 10) : 1;
    const page_size = Math.min(qs['page_size'] ? parseInt(qs['page_size'], 10) : 100, 500);

    const result = await listMyAssignments(user_id, org_id, page, page_size);
    const assignments = (result.assignments as Record<string, unknown>[]).map(toAssignmentView);
    return reply.status(200).send({ assignments, total: result.total, page: result.page, page_size: result.page_size });
  });

  app.get('/assignments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const assignment = await getAssignmentById(id);
    if (!assignment) return reply.status(404).send({ error: 'Assignment not found' });
    return reply.status(200).send({ assignment: toAssignmentView(assignment) });
  });

  app.patch('/assignments/:id', async (request, reply) => {
    const user_id = request.headers['x-user-id'] as string;
    const user_rank = parseInt(request.headers['x-rank'] as string ?? '0', 10);
    if (!user_id) return reply.status(401).send({ error: 'Missing auth headers' });

    if (user_rank < RANKS.SSE) {
      return reply.status(403).send({ error: 'Insufficient permissions to reassign' });
    }

    const { id } = request.params as { id: string };
    const org_id = request.headers['x-org-id'] as string;
    if (!org_id) return reply.status(401).send({ error: 'Missing auth headers' });

    const parsed = updateAssignmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const target_user = await getUserByIdForAssignment(org_id, user_id, parsed.data.assigned_to);
    if (!target_user || !target_user['is_active']) {
      return reply.status(400).send({ error: 'Target user not found or inactive' });
    }

    const target_rank = Number(target_user['rank'] ?? 0);
    if (!canAssignToUser(user_rank, target_rank, user_id, String(target_user['id']))) {
      return reply.status(403).send({ error: 'Insufficient permissions to assign to this user' });
    }

    const { result, previous_assignee } = await reassignLead({
      lead_id: id,
      assigned_to: parsed.data.assigned_to,
      assigned_by: user_id,
      notes: parsed.data.notes ?? null,
    });

    if (!result) return reply.status(404).send({ error: 'Assignment not found' });

    await logActivity({
      action_type: 'assignment_reassigned',
      performed_by: user_id,
      lead_id: id,
      old_value: { assigned_to: previous_assignee },
      new_value: { assigned_to: parsed.data.assigned_to },
    });

    return reply.status(200).send({ ok: true });
  });

  app.delete('/assignments/:id', async (request, reply) => {
    const user_id = request.headers['x-user-id'] as string;
    const user_rank = parseInt(request.headers['x-rank'] as string ?? '0', 10);
    if (!user_id) return reply.status(401).send({ error: 'Missing auth headers' });
    if (user_rank < RANKS.ADMIN) return reply.status(403).send({ error: 'Only admins can remove assignments' });

    const { id } = request.params as { id: string };
    const result = await unassignLead(id);
    if (!result) return reply.status(404).send({ error: 'Assignment not found' });

    await logActivity({
      action_type: 'assignment_removed',
      performed_by: user_id,
      lead_id: id,
    });

    return reply.status(200).send({ ok: true });
  });
}
