import type { FastifyInstance } from 'fastify';
import { loginSchema, changePasswordSchema } from '@crm/validation';
import { AUTH_COOKIE_NAME } from '@crm/auth-constants';
import { withServiceTx } from '@crm/db';
import { getUserByEmail, getUserById, updateLastLogin } from '../db-user.js';
import { comparePassword, hashPassword } from '../password.js';
import { signJwt, verifyJwt, revokeJti, isJtiRevoked } from '../jwt.js';
import { sessionCookieOptions, clearedSessionCookieOptions } from '../cookies.js';
import { toSessionUser } from '../serializers/users.js';
import { logActivity } from '../activity-logger.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }
    const { email, password, org_id } = parsed.data;

    const db_user = await getUserByEmail(email, org_id);
    if (!db_user) {
      await logActivity({ action_type: 'login_failure', performed_by: 'unknown', new_value: { email, reason: 'user_not_found' } });
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    if (!db_user.is_active) {
      await logActivity({ action_type: 'login_failure', performed_by: db_user.id, new_value: { email, reason: 'account_inactive' } });
      return reply.status(401).send({ error: 'Account is deactivated. Please contact your administrator.' });
    }

    const password_valid = db_user.password_hash
      ? await comparePassword(password, db_user.password_hash)
      : false;

    if (!password_valid) {
      await logActivity({ action_type: 'login_failure', performed_by: db_user.id, new_value: { email, reason: 'invalid_password' } });
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const pwd_iat = db_user.password_changed_at
      ? Math.floor(db_user.password_changed_at.getTime() / 1000)
      : 0;

    const token = signJwt({
      sub: db_user.id,
      email: db_user.email,
      role: db_user.role_name as never,
      rank: db_user.rank,
      org_id: db_user.org_id,
      tenant_id: db_user.tenant_id,
      pwd_iat,
    });

    await updateLastLogin(db_user.id);
    await logActivity({ action_type: 'login_success', performed_by: db_user.id });

    const session_user = toSessionUser({ ...db_user, last_login_at: new Date() });

    return reply
      .setCookie(AUTH_COOKIE_NAME, token, sessionCookieOptions())
      .status(200)
      .send({ user: session_user });
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[AUTH_COOKIE_NAME];
    if (token) {
      const result = verifyJwt(token);
      if (result.ok) {
        // Revoke the JTI so the token cannot be used even before it expires
        if (result.payload.jti && result.payload.exp) {
          revokeJti(result.payload.jti, result.payload.exp);
        }
        await logActivity({ action_type: 'logout', performed_by: result.payload.sub });
      }
    }
    return reply
      .setCookie(AUTH_COOKIE_NAME, '', clearedSessionCookieOptions())
      .status(200)
      .send({ ok: true });
  });

  app.get('/auth/me', async (request, reply) => {
    const token = request.cookies[AUTH_COOKIE_NAME];
    if (!token) return reply.status(401).send({ error: 'Not authenticated' });

    const result = verifyJwt(token);
    if (!result.ok) return reply.status(401).send({ error: 'Session expired' });

    if (result.payload.jti && isJtiRevoked(result.payload.jti)) {
      return reply
        .setCookie(AUTH_COOKIE_NAME, '', clearedSessionCookieOptions())
        .status(401)
        .send({ error: 'Session has been revoked. Please log in again.' });
    }

    const db_user = await getUserById(result.payload.sub);
    if (!db_user || !db_user.is_active) {
      return reply.status(401).send({ error: 'User not found or inactive' });
    }

    const pwd_iat = db_user.password_changed_at
      ? Math.floor(db_user.password_changed_at.getTime() / 1000)
      : 0;

    if (result.payload.pwd_iat < pwd_iat) {
      return reply
        .setCookie(AUTH_COOKIE_NAME, '', clearedSessionCookieOptions())
        .status(401)
        .send({ error: 'Session invalidated. Please log in again.' });
    }

    return reply.status(200).send({ user: toSessionUser(db_user) });
  });

  app.post('/auth/change-password', async (request, reply) => {
    const user_id = (request.headers['x-user-id'] as string) ?? '';
    if (!user_id) return reply.status(401).send({ error: 'Not authenticated' });

    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }
    const { current_password, new_password } = parsed.data;

    const db_user = await getUserById(user_id);
    if (!db_user) return reply.status(404).send({ error: 'User not found' });

    const valid = db_user.password_hash
      ? await comparePassword(current_password, db_user.password_hash)
      : false;

    if (!valid) {
      return reply.status(400).send({ error: 'Current password is incorrect' });
    }

    const new_hash = await hashPassword(new_password);
    const updated_rows = await withServiceTx(async (tx) => {
      return tx.unsafe<Array<{ password_changed_at: Date }>>(
        `UPDATE users
         SET password_hash = $1, password_changed_at = CLOCK_TIMESTAMP(), force_password_change = FALSE
         WHERE id = $2
         RETURNING password_changed_at`,
        [new_hash, user_id],
      );
    });

    const pca = updated_rows[0]?.password_changed_at;
    const pwd_iat = pca ? Math.floor(pca.getTime() / 1000) : Math.floor(Date.now() / 1000);

    const new_token = signJwt({
      sub: db_user.id,
      email: db_user.email,
      role: db_user.role_name as never,
      rank: db_user.rank,
      org_id: db_user.org_id,
      tenant_id: db_user.tenant_id,
      pwd_iat,
    });

    await logActivity({ action_type: 'password_changed_self', performed_by: user_id });

    return reply
      .setCookie(AUTH_COOKIE_NAME, new_token, sessionCookieOptions())
      .status(200)
      .send({ ok: true });
  });
}
