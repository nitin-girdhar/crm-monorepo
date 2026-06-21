import type { FastifyInstance } from 'fastify';
import { handleWebhookChallenge, handleWebhookPost } from './webhook.controller.js';

export async function webhookRouter(app: FastifyInstance) {
  app.get('/webhook/:integrationId', handleWebhookChallenge);
  app.post('/webhook/:integrationId', handleWebhookPost);
}
