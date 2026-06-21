import type { FastifyRequest, FastifyReply } from 'fastify';
import { BadRequestError } from '../../../lib/errors.js';
import * as repo from './intake.repository.js';

export class IntakeController {
  webhook = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    const org_id = String(body['org_id'] ?? '');
    if (!org_id) throw new BadRequestError('org_id is required');
    const result = await repo.createWebhookLead({ org_id, ...body });
    return reply.status(201).send({ success: true, data: { id: result.id } });
  };
}
