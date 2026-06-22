import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { getBranchesQuerySchema } from './branches.schema.js';
import { BranchesController } from './branches.controller.js';

export async function branchesRouter(app: FastifyInstance) {
  const ctrl = new BranchesController();

  app.get('/branches',      { preHandler: [authenticate, validate({ query: getBranchesQuerySchema })] }, ctrl.getBranches);
  app.get('/branches/all',  { preHandler: [authenticate] }, ctrl.getAllBranches);
  app.get('/lead-sources',  { preHandler: [authenticate] }, ctrl.getLeadSources);
}
