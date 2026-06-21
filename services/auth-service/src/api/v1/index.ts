import type { FastifyInstance } from 'fastify';
import { authRouter } from './auth/auth.router.js';

export async function v1Router(app: FastifyInstance): Promise<void> {
  app.register(authRouter, { prefix: '/auth' });
}
