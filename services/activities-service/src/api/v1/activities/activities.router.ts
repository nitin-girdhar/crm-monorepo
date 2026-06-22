import type { FastifyInstance } from 'fastify';
import { ActivitiesController } from './activities.controller.js';
import { authenticate } from '../../../middleware/auth.middleware.js';

export async function activitiesRouter(app: FastifyInstance) {
  const ctrl = new ActivitiesController();

  app.post('/activities', { preHandler: [authenticate] }, ctrl.create);
  app.get('/activities',  { preHandler: [authenticate] }, ctrl.list);
}
