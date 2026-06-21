import type { FastifyInstance } from 'fastify';
import { CronController } from './cron.controller.js';

const ctrl = new CronController();

export async function cronRouter(app: FastifyInstance) {
  app.post('/cron/mark-missed-followups', ctrl.markMissedFollowUps);
}
