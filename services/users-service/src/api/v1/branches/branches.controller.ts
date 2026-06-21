import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './branches.service.js';
import type { GetBranchesQuery } from './branches.schema.js';

export class BranchesController {
  getBranches = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id } = request.auth;
    const q = request.query as GetBranchesQuery;
    const branches = await service.getBranches({ org_id, user_id, role, tenant_id }, {
      ...(q.cityIds.length    ? { cityIds:    q.cityIds }    : {}),
      ...(q.stateIds.length   ? { stateIds:   q.stateIds }   : {}),
      ...(q.countryIds.length ? { countryIds: q.countryIds } : {}),
    });
    return reply.send({ success: true, data: branches });
  };

  getAllBranches = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id } = request.auth;
    const branches = await service.getAllBranches({ org_id, user_id, role, tenant_id });
    return reply.send({ success: true, data: branches });
  };

  getLeadSources = async (_request: FastifyRequest, reply: FastifyReply) => {
    const sources = await service.getLeadSources();
    return reply.send({ success: true, data: sources });
  };
}
