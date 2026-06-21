import type { FastifyInstance } from 'fastify';
import { IntakeController } from './intake.controller.js';

const ctrl = new IntakeController();

export async function intakeRouter(app: FastifyInstance) {
  app.post('/intake/webhook', ctrl.webhook);
}
