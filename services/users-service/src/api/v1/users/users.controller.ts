import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CreateUserInput, UpdateUserInput, ResetPasswordInput, UpdateAssignmentWeightsInput } from '@crm/validation';
import { RANKS } from '@crm/permissions';
import { ForbiddenError } from '../../../lib/errors.js';
import * as service from './users.service.js';
import type { ListUsersQuery } from './users.schema.js';

export class UsersController {
  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id } = request.auth;
    const q = request.query as ListUsersQuery;
    const result = await service.listUsers({ org_id, user_id, role, tenant_id }, q.page, q.page_size);
    return reply.send({ success: true, data: result.users, total: result.total, page: result.page, page_size: result.page_size });
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id } = request.auth;
    const { id } = request.params as { id: string };
    const user = await service.getUserById({ org_id, user_id, role, tenant_id }, id);
    return reply.send({ success: true, data: user });
  };

  getAssignable = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id, rank } = request.auth;
    const users = await service.getAssignableUsers({ org_id, user_id, role, tenant_id }, rank);
    return reply.send({ success: true, data: users });
  };

  getAssignmentWeights = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id } = request.auth;
    const weights = await service.getAssignmentWeights({ org_id, user_id, role, tenant_id });
    return reply.send({ success: true, data: weights });
  };

  updateAssignmentWeights = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id, rank } = request.auth;
    if (rank < RANKS.ADMIN) throw new ForbiddenError('Only org admins can manage lead assignment weights');
    const data = request.body as UpdateAssignmentWeightsInput;
    await service.updateAssignmentWeights({ org_id, user_id, role, tenant_id }, data.weights);
    return reply.status(204).send();
  };

  getTeam = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id } = request.auth;
    const members = await service.getTeamMembers({ org_id, user_id, role, tenant_id });
    return reply.send({ success: true, data: members });
  };

  getOrgChart = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id } = request.auth;
    const chart = await service.getOrgChart({ org_id, user_id, role, tenant_id });
    return reply.send({ success: true, data: chart });
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id, rank } = request.auth;
    if (rank < RANKS.SSE) throw new ForbiddenError('Insufficient permissions to create iam.users');
    const data = request.body as CreateUserInput;
    const result = await service.createUser({ org_id, user_id, role, tenant_id }, data);
    return reply.status(201).header('Cache-Control', 'no-store').send({ success: true, data: { id: result.id, email: result.email }, temporary_password: result.temporary_password });
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id, rank } = request.auth;
    if (rank < RANKS.SSE) throw new ForbiddenError('Insufficient permissions to update iam.users');
    const { id } = request.params as { id: string };
    const data = request.body as UpdateUserInput;
    await service.updateUser({ org_id, user_id, role, tenant_id }, id, data);
    return reply.status(204).send();
  };

  delete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id, rank } = request.auth;
    if (rank < RANKS.ADMIN) throw new ForbiddenError('Forbidden');
    const { id } = request.params as { id: string };
    await service.deleteUser({ org_id, user_id, role, tenant_id }, id);
    return reply.status(204).send();
  };

  resetPassword = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id, rank } = request.auth;
    if (rank < RANKS.ADMIN) throw new ForbiddenError('Only admins can reset passwords');
    const { id } = request.params as { id: string };
    const data = request.body as ResetPasswordInput;
    const result = await service.resetPassword({ org_id, user_id, role, tenant_id }, id, data);
    return reply.header('Cache-Control', 'no-store').send({ success: true, data: { temporary_password: result.temporary_password } });
  };
}
