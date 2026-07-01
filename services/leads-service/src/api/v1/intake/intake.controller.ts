import type { FastifyRequest, FastifyReply } from 'fastify';
import { BadRequestError } from '../../../lib/errors.js';
import * as repo from './intake.repository.js';

export class IntakeController {
  // Called by internal services (meta webhook, other service-to-service calls).
  // org_id is trusted from the request body since the caller is an internal service.
  webhook = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;
    const org_id = String(body['org_id'] ?? '');
    if (!org_id) throw new BadRequestError('org_id is required');
    const result = await repo.createWebhookLead({ org_id, ...body });
    return reply.status(201).send({ success: true, data: result });
  };

  // Called via the public gateway route. org_id is resolved from the API key
  // by authenticateApiKey middleware and attached to request.intakeOrgId —
  // the body's org_id field is ignored entirely.
  publicLead = async (request: FastifyRequest, reply: FastifyReply) => {
    const org_id = request.intakeOrgId!;
    const body = request.body as Record<string, unknown>;
    const result = await repo.createWebhookLead({ ...body, org_id });
    return reply.status(201).send({ success: true, data: result });
  };
}
