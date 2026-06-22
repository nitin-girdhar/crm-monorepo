import type { FastifyInstance } from 'fastify';
import { AuthController } from './auth.controller.js';
import { requireInternalSecret } from '../../../middleware/auth.middleware.js';

const ctrl = new AuthController();

export async function authRouter(app: FastifyInstance): Promise<void> {
  app.post('/login', ctrl.login);
  app.post('/logout', ctrl.logout);
  app.get('/me', ctrl.me);
  app.post('/change-password', { preHandler: [requireInternalSecret] }, ctrl.changePassword);
}
