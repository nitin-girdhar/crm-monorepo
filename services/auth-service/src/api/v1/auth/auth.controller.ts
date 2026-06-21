import type { FastifyRequest, FastifyReply } from 'fastify';
import { AUTH_COOKIE_NAME, sessionCookieOptions, clearedSessionCookieOptions } from '../../../lib/cookies.js';
import { UnauthorizedError } from '../../../lib/errors.js';
import * as service from './auth.service.js';
import { loginSchema, changePasswordSchema } from './auth.schema.js';

export class AuthController {
  login = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);
    const { token, user } = await service.login(body);
    return reply
      .setCookie(AUTH_COOKIE_NAME, token, sessionCookieOptions())
      .status(200)
      .send({ success: true, data: { user } });
  };

  logout = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[AUTH_COOKIE_NAME];
    service.logout(token);
    return reply
      .setCookie(AUTH_COOKIE_NAME, '', clearedSessionCookieOptions())
      .status(200)
      .send({ success: true, data: null });
  };

  me = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[AUTH_COOKIE_NAME];
    try {
      const user = await service.getSession(token);
      return reply.status(200).send({ success: true, data: { user } });
    } catch (err) {
      if (err instanceof UnauthorizedError && err.message !== 'Not authenticated' && err.message !== 'Session expired') {
        return reply
          .setCookie(AUTH_COOKIE_NAME, '', clearedSessionCookieOptions())
          .status(401)
          .send({ success: false, error: err.message });
      }
      throw err;
    }
  };

  changePassword = async (request: FastifyRequest, reply: FastifyReply) => {
    const user_id = (request.headers['x-user-id'] as string) ?? '';
    if (!user_id) throw new UnauthorizedError('Not authenticated');

    const body = changePasswordSchema.parse(request.body);
    const new_token = await service.changePassword(user_id, body.current_password, body.new_password);

    return reply
      .setCookie(AUTH_COOKIE_NAME, new_token, sessionCookieOptions())
      .status(200)
      .send({ success: true, data: null });
  };
}
