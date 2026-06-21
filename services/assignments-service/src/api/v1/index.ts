import type { FastifyInstance } from 'fastify';
import { assignmentsRouter } from './assignments/assignments.router.js';

export async function v1Router(app: FastifyInstance) {
  await app.register(assignmentsRouter);
}
