import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './communication.service.js';
import type {
  SendEmailInput,
  SendWhatsAppTextInput,
  SendWhatsAppTemplateInput,
  SendCommunicationInput,
} from './communication.schema.js';

export class CommunicationController {
  getStatus = async (_request: FastifyRequest, reply: FastifyReply) => {
    const data = service.getStatus();
    return reply.send({ success: true, data });
  };

  sendEmail = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id } = request.auth;
    const input = request.body as SendEmailInput;
    const data = await service.sendEmail({ org_id, user_id, role, tenant_id }, input);
    return reply.send({ success: true, data });
  };

  sendWhatsAppText = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id } = request.auth;
    const input = request.body as SendWhatsAppTextInput;
    const data = await service.sendWhatsAppText({ org_id, user_id, role, tenant_id }, input);
    return reply.send({ success: true, data });
  };

  sendWhatsAppTemplate = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id } = request.auth;
    const input = request.body as SendWhatsAppTemplateInput;
    const data = await service.sendWhatsAppTemplate({ org_id, user_id, role, tenant_id }, input);
    return reply.send({ success: true, data });
  };

  send = async (request: FastifyRequest, reply: FastifyReply) => {
    const { org_id, user_id, role, tenant_id } = request.auth;
    const input = request.body as SendCommunicationInput;
    const data = await service.send({ org_id, user_id, role, tenant_id }, input);
    return reply.send({ success: true, data });
  };
}
