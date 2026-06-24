import type { FastifyInstance } from 'fastify';
import { communicationsRouter } from './communications/communication.router.js';

export async function v1Router(app: FastifyInstance) {
  await app.register(communicationsRouter);
}
