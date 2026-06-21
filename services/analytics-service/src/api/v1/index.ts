import type { FastifyInstance } from 'fastify';
import { analyticsRouter } from './analytics/analytics.router.js';

export async function v1Router(app: FastifyInstance) {
  await app.register(analyticsRouter);
}
