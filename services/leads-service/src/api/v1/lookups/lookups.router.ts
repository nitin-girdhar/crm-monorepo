import type { FastifyInstance } from 'fastify';
import { LookupsController } from './lookups.controller.js';

const ctrl = new LookupsController();

export async function lookupsRouter(app: FastifyInstance) {
  app.get('/lookups', ctrl.getLookups);
  app.get('/lookups/cities', ctrl.getCities);
  app.get('/locations', ctrl.getLocations);
}
