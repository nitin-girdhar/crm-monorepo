import type { FastifyInstance } from 'fastify';
import { activitiesRouter } from './activities/activities.router.js';

export async function v1Router(app: FastifyInstance) {
  await app.register(activitiesRouter);
}
