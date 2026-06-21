import type { FastifyInstance } from 'fastify';
import { ActivitiesController } from './activities.controller.js';

export async function activitiesRouter(app: FastifyInstance) {
  const ctrl = new ActivitiesController();

  app.post('/activities', {}, ctrl.create);
  app.get('/activities',  {}, ctrl.list);
}
