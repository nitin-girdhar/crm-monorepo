import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { createUserSchema, updateUserSchema, resetPasswordSchema } from '@crm/validation';
import { listUsersQuerySchema } from './users.schema.js';
import { UsersController } from './users.controller.js';

export async function usersRouter(app: FastifyInstance) {
  const ctrl = new UsersController();

  app.get('/users',            { preHandler: [authenticate, validate({ query: listUsersQuerySchema })] }, ctrl.list);
  app.get('/users/assignable', { preHandler: [authenticate] }, ctrl.getAssignable);
  app.get('/users/team',       { preHandler: [authenticate] }, ctrl.getTeam);
  app.get('/users/org-chart',  { preHandler: [authenticate] }, ctrl.getOrgChart);
  app.get('/users/:id',        { preHandler: [authenticate] }, ctrl.getById);
  app.post('/users',           { preHandler: [authenticate, validate({ body: createUserSchema })] }, ctrl.create);
  app.patch('/users/:id',      { preHandler: [authenticate, validate({ body: updateUserSchema })] }, ctrl.update);
  app.delete('/users/:id',     { preHandler: [authenticate] }, ctrl.delete);
  app.post('/users/:id/reset-password', { preHandler: [authenticate, validate({ body: resetPasswordSchema })] }, ctrl.resetPassword);
}
