import type { FastifyInstance } from 'fastify';
import { leadsRouter } from './leads/leads.router.js';
import { campaignsRouter } from './campaigns/campaigns.router.js';
import { lookupsRouter } from './lookups/lookups.router.js';
import { intakeRouter } from './intake/intake.router.js';
import { cronRouter } from './cron/cron.router.js';

export async function v1Router(app: FastifyInstance) {
  await app.register(leadsRouter);
  await app.register(campaignsRouter);
  await app.register(lookupsRouter);
  await app.register(intakeRouter);
  await app.register(cronRouter);
}
