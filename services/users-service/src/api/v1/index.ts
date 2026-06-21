import type { FastifyInstance } from 'fastify';
import { usersRouter } from './users/users.router.js';
import { branchesRouter } from './branches/branches.router.js';

export async function v1Router(app: FastifyInstance) {
  await app.register(usersRouter);
  await app.register(branchesRouter);
}
