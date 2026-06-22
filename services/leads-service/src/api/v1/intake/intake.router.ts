import type { FastifyInstance } from 'fastify';
import { IntakeController } from './intake.controller.js';
import { authenticateInternal } from './intake.auth.js';

const ctrl = new IntakeController();

export async function intakeRouter(app: FastifyInstance) {
  app.post('/intake/webhook', { preHandler: [authenticateInternal] }, ctrl.webhook);
}
