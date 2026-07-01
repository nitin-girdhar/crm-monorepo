import type { FastifyInstance } from 'fastify';
import { IntakeController } from './intake.controller.js';
import { authenticateInternal, authenticateApiKey } from './intake.auth.js';

const ctrl = new IntakeController();

export async function intakeRouter(app: FastifyInstance) {
  // Internal service-to-service: called by meta-conversion-api, cron jobs, etc.
  app.post('/intake/webhook', { preHandler: [authenticateInternal] }, ctrl.webhook);

  // Public website intake: called by external website forms via the gateway.
  // Org is resolved from the X-Api-Key header — not trusted from the body.
  app.post('/intake/leads', { preHandler: [authenticateApiKey] }, ctrl.publicLead);
}
