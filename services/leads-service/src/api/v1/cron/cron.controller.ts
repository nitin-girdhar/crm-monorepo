import type { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../../lib/errors.js';
import { config } from '../../../config/index.js';
import * as repo from './cron.repository.js';

export class CronController {
  markMissedFollowUps = async (request: FastifyRequest, reply: FastifyReply) => {
    const secret = request.headers['x-cron-secret'];
    if (!config.cronSecret || secret !== config.cronSecret) throw new ForbiddenError();
    const marked_missed = await repo.markMissedFollowUps();
    return reply.send({ success: true, data: { marked_missed } });
  };
}
