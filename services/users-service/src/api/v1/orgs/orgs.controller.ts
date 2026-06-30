import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './orgs.service.js';
import type { GetOrgsQuery } from './orgs.schema.js';

export class OrgsController {
  getOrgs = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id } = request.auth;
    const q = request.query as GetOrgsQuery;
    const orgs = await service.getOrgs({ org_id, user_id, role, tenant_id }, {
      ...(q.cityIds.length    ? { cityIds:    q.cityIds }    : {}),
      ...(q.stateIds.length   ? { stateIds:   q.stateIds }   : {}),
      ...(q.countryIds.length ? { countryIds: q.countryIds } : {}),
    });
    return reply.send({ success: true, data: orgs });
  };

  getAllOrgs = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id } = request.auth;
    const orgs = await service.getAllOrgs({ org_id, user_id, role, tenant_id });
    return reply.send({ success: true, data: orgs });
  };

  getLeadSources = async (_request: FastifyRequest, reply: FastifyReply) => {
    const sources = await service.getLeadSources();
    return reply.send({ success: true, data: sources });
  };
}
