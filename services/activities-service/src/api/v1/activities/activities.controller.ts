import type { FastifyRequest, FastifyReply } from 'fastify';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '../../../lib/errors.js';
import * as repo from './activities.repository.js';

export class ActivitiesController {
  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    if (!body['action_type'] || !body['performed_by']) {
      throw new BadRequestError('action_type and performed_by are required');
    }

    await repo.insertActivity({
      action_type:     String(body['action_type']),
      performed_by:    String(body['performed_by']),
      ...(body['subject_user_id'] ? { subject_user_id: String(body['subject_user_id']) } : {}),
      ...(body['lead_id'] ? { lead_id: String(body['lead_id']) } : {}),
      ...(body['old_value'] !== undefined ? { old_value: body['old_value'] } : {}),
      ...(body['new_value'] !== undefined ? { new_value: body['new_value'] } : {}),
    });

    return reply.status(201).send({ success: true, data: { ok: true } });
  };

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const userRole = request.headers['x-user-role'] as string | undefined;

    const adminRoles = new Set(['org_admin', 'tenant_admin', 'super_admin']);
    if (userRole && !adminRoles.has(userRole)) throw new ForbiddenError();

    const activities = await repo.listActivities();
    return reply.send({ success: true, data: activities });
  };
}
