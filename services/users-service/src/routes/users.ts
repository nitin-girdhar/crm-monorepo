import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { RANKS } from '@crm/permissions';
import { createUserSchema, updateUserSchema, resetPasswordSchema } from '@crm/validation';
import {
  listUsers,
  getUserById,
  getAssignableUsers,
  getTeamMembers,
  getOrgChart,
} from '../queries/users.js';
import {
  createUser,
  updateUser,
  softDeleteUser,
  adminResetPassword,
} from '../mutations/users.js';
import { toUserView } from '../serializers/users.js';
import { logActivity } from '../activity-logger.js';
import { parseAuthContext } from '../lib/auth-context.js';

function generateTemporaryPassword(): string {
  return randomBytes(16).toString('base64url');
}

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/users', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const qs = request.query as Record<string, string>;
    const page = qs['page'] ? parseInt(qs['page'], 10) : 1;
    const page_size = Math.min(qs['page_size'] ? parseInt(qs['page_size'], 10) : 100, 500);

    const result = await listUsers(org_id, user_id, page, page_size, role, tenant_id);
    const users = (result.users as Record<string, unknown>[]).map(toUserView);
    return reply.status(200).send({ users, total: result.total, page: result.page, page_size: result.page_size });
  });

  app.post('/users', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id, rank: user_rank } = ctx;

    if (user_rank < RANKS.SSE) {
      return reply.status(403).send({ error: 'Insufficient permissions to create iam.users' });
    }

    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const temporary_password = generateTemporaryPassword();

    try {
      const result = await createUser(org_id, user_id, {
        ...parsed.data,
        password: temporary_password,
        force_password_change: parsed.data.force_password_change ?? true,
      }, role, tenant_id);
      await logActivity({
        action_type: 'user_created',
        performed_by: user_id,
        subject_user_id: result.id,
        new_value: { email: parsed.data.email, role: parsed.data.role_name },
      });
      return reply.status(201).send({ user: { email: parsed.data.email, id: result.id }, temporary_password });
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (msg.includes('unique') || msg.includes('uq_users')) {
        return reply.status(409).send({ error: 'A user with this email already exists.' });
      }
      throw err;
    }
  });

  app.get('/users/assignable', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id, rank: user_rank } = ctx;

    const rows = await getAssignableUsers(org_id, user_id, user_rank, role, tenant_id);
    const users = (rows as Array<Record<string, unknown>>).map(toUserView);
    return reply.status(200).send({ users });
  });

  app.get('/users/team', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const members = await getTeamMembers(org_id, user_id, role, tenant_id);
    return reply.status(200).send({ members });
  });

  app.get('/users/org-chart', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const chart = await getOrgChart(org_id, user_id, role, tenant_id);
    return reply.status(200).send({ chart });
  });

  app.get('/users/:id', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id } = ctx;

    const { id } = request.params as { id: string };
    const user = await getUserById(org_id, user_id, id, role, tenant_id);
    if (!user) return reply.status(404).send({ error: 'User not found' });

    return reply.status(200).send({ user: toUserView(user as Record<string, unknown>) });
  });

  app.patch('/users/:id', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id, rank: user_rank } = ctx;

    if (user_rank < RANKS.SSE) {
      return reply.status(403).send({ error: 'Insufficient permissions to update iam.users' });
    }

    const { id } = request.params as { id: string };
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    // Use RLS-scoped lookup: if the target user is outside the actor's scope,
    // getUserById returns null and we respond 404 — preventing cross-org updates.
    const before_user = await getUserById(org_id, user_id, id, role, tenant_id);
    if (!before_user) return reply.status(404).send({ error: 'User not found' });

    const result = await updateUser(org_id, user_id, id, parsed.data, role, tenant_id);
    if (!result) return reply.status(404).send({ error: 'User not found' });

    if (parsed.data.is_active === false) {
      await logActivity({ action_type: 'user_deactivated', performed_by: user_id, subject_user_id: id });
    } else if (parsed.data.is_active === true) {
      await logActivity({ action_type: 'user_reactivated', performed_by: user_id, subject_user_id: id });
    } else if (parsed.data.role_name) {
      await logActivity({
        action_type: 'role_changed',
        performed_by: user_id,
        subject_user_id: id,
        old_value: { role: (before_user as Record<string, unknown>)['role_name'] },
        new_value: { role: parsed.data.role_name },
      });
    } else {
      await logActivity({ action_type: 'user_updated', performed_by: user_id, subject_user_id: id });
    }

    return reply.status(200).send({ ok: true });
  });

  app.delete('/users/:id', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id, rank: user_rank } = ctx;

    if (user_rank < RANKS.ADMIN) return reply.status(403).send({ error: 'Forbidden' });

    const { id } = request.params as { id: string };
    await softDeleteUser(org_id, user_id, id, role, tenant_id);
    await logActivity({ action_type: 'user_deactivated', performed_by: user_id, subject_user_id: id });
    return reply.status(200).send({ ok: true });
  });

  app.post('/users/:id/reset-password', async (request, reply) => {
    const ctx = parseAuthContext(request, reply);
    if (!ctx) return;
    const { org_id, user_id, role, tenant_id, rank: user_rank } = ctx;

    if (user_rank < RANKS.ADMIN) return reply.status(403).send({ error: 'Only admins can reset passwords' });

    const { id } = request.params as { id: string };
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const temporary_password = parsed.data.new_password ?? generateTemporaryPassword();
    const result = await adminResetPassword(org_id, user_id, id, temporary_password, role, tenant_id);
    if (!result) return reply.status(404).send({ error: 'User not found' });

    await logActivity({
      action_type: 'password_reset_by_admin',
      performed_by: user_id,
      subject_user_id: id,
    });

    return reply.status(200).send({ temporary_password });
  });
}
