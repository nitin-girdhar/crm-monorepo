import { UnauthorizedError, BadRequestError } from '../../../lib/errors.js';
import { comparePassword, hashPassword } from '../../../lib/password.js';
import { signJwt, verifyJwt, revokeJti, isJtiRevoked } from '../../../lib/jwt.js';
import { logActivity } from '../../../lib/activity-logger.js';
import { AUTH_COOKIE_NAME } from '../../../lib/cookies.js';
import * as repo from './auth.repository.js';
import { toSessionUser } from './auth.types.js';
import type { DatabaseUser } from './auth.types.js';
import type { LoginInput } from './auth.schema.js';

export interface LoginResult {
  token: string;
  user: ReturnType<typeof toSessionUser>;
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const db_user = await repo.getUserByEmail(input.email, input.org_id);

  if (!db_user) {
    void logActivity({
      action_type: 'login_failure',
      performed_by: 'unknown',
      ...(input.org_id ? { org_id: input.org_id } : {}),
      new_value: { email: input.email, reason: 'user_not_found' },
    });
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!db_user.is_active) {
    void logActivity({
      action_type: 'login_failure',
      performed_by: db_user.id,
      org_id: db_user.org_id,
      tenant_id: db_user.tenant_id,
      role: db_user.role_name,
      new_value: { email: input.email, reason: 'account_inactive' },
    });
    throw new UnauthorizedError('Account is deactivated. Please contact your administrator.');
  }

  const password_valid = db_user.password_hash
    ? await comparePassword(input.password, db_user.password_hash)
    : false;

  if (!password_valid) {
    void logActivity({
      action_type: 'login_failure',
      performed_by: db_user.id,
      org_id: db_user.org_id,
      tenant_id: db_user.tenant_id,
      role: db_user.role_name,
      new_value: { email: input.email, reason: 'invalid_password' },
    });
    throw new UnauthorizedError('Invalid email or password');
  }

  const pwd_iat = db_user.password_changed_at
    ? Math.floor(new Date(db_user.password_changed_at as unknown as string).getTime() / 1000)
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

  await repo.updateLastLogin(db_user.id);
  await logActivity({ action_type: 'login_success', performed_by: db_user.id, org_id: db_user.org_id, tenant_id: db_user.tenant_id, role: db_user.role_name });

  return {
    token,
    user: toSessionUser({ ...db_user, last_login_at: new Date() } as DatabaseUser),
  };
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  const result = verifyJwt(token);
  if (result.ok && result.payload.jti && result.payload.exp) {
    await revokeJti(result.payload.jti, result.payload.exp, {
      user_id: result.payload.sub,
      org_id: result.payload.org_id,
      tenant_id: result.payload.tenant_id,
    });
    void logActivity({ action_type: 'logout', performed_by: result.payload.sub, org_id: result.payload.org_id, tenant_id: result.payload.tenant_id, role: result.payload.role });
  }
}

export { AUTH_COOKIE_NAME };

export async function getSession(
  token: string | undefined,
): Promise<ReturnType<typeof toSessionUser>> {
  if (!token) throw new UnauthorizedError('Not authenticated');

  const result = verifyJwt(token);
  if (!result.ok) throw new UnauthorizedError('Session expired');

  if (result.payload.jti && await isJtiRevoked(result.payload.jti, {
    user_id: result.payload.sub,
    org_id: result.payload.org_id,
    tenant_id: result.payload.tenant_id,
    ...(result.payload.iat !== undefined ? { issued_at: result.payload.iat } : {}),
  })) {
    throw new UnauthorizedError('Session has been revoked. Please log in again.');
  }

  const db_user = await repo.getUserById(result.payload.sub);
  if (!db_user || !db_user.is_active) {
    throw new UnauthorizedError('User not found or inactive');
  }

  const pwd_iat = db_user.password_changed_at
    ? Math.floor(new Date(db_user.password_changed_at as unknown as string).getTime() / 1000)
    : 0;

  if (result.payload.pwd_iat < pwd_iat) {
    throw new UnauthorizedError('Session invalidated. Please log in again.');
  }

  return toSessionUser(db_user);
}

export async function changePassword(
  user_id: string,
  current_password: string,
  new_password: string,
): Promise<string> {
  const db_user = await repo.getUserById(user_id);
  if (!db_user) throw new UnauthorizedError('User not found');

  const valid = db_user.password_hash
    ? await comparePassword(current_password, db_user.password_hash)
    : false;

  if (!valid) throw new BadRequestError('Current password is incorrect');

  const new_hash = await hashPassword(new_password);
  const updated = await repo.changePassword(user_id, new_hash);

  const pca = updated?.password_changed_at;
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

  await logActivity({ action_type: 'password_changed_self', performed_by: user_id, org_id: db_user.org_id, tenant_id: db_user.tenant_id, role: db_user.role_name });

  return new_token;
}
