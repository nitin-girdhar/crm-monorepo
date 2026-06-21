import type { FastifyInstance } from 'fastify';
import { withServiceTx } from '@crm/db';
import { insertActivity } from '../mutations/activities.js';

export async function activitiesRoutes(app: FastifyInstance): Promise<void> {
  app.post('/activities', async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    if (!body['action_type'] || !body['performed_by']) {
      return reply.status(400).send({ error: 'action_type and performed_by are required' });
    }

    await insertActivity({
      action_type: String(body['action_type']),
      performed_by: String(body['performed_by']),
      subject_user_id: body['subject_user_id'] ? String(body['subject_user_id']) : null,
      lead_id: body['lead_id'] ? String(body['lead_id']) : null,
      old_value: body['old_value'],
      new_value: body['new_value'],
    });

    return reply.status(201).send({ ok: true });
  });

  app.get('/activities', async (request, reply) => {
    const is_internal = request.headers['x-internal-request'] === '1';
    const user_id = request.headers['x-user-id'] as string | undefined;
    const user_role = request.headers['x-user-role'] as string | undefined;

    if (!is_internal && !user_id) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const admin_roles = new Set(['org_admin', 'tenant_admin', 'super_admin']);
    if (!is_internal && user_role && !admin_roles.has(user_role)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const activities = await withServiceTx(async (tx) => {
      return tx.unsafe(
        `SELECT id, action_type, performed_by, target_id, target_type, meta, created_at
         FROM audit.activities
         ORDER BY created_at DESC
         LIMIT 100`,
      );
    });

    return reply.status(200).send({ activities });
  });
}
