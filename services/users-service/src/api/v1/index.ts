import type { FastifyInstance } from 'fastify';
import { usersRouter } from './users/users.router.js';
import { orgsRouter } from './orgs/orgs.router.js';

export async function v1Router(app: FastifyInstance) {
  await app.register(usersRouter);
  await app.register(orgsRouter);
}
