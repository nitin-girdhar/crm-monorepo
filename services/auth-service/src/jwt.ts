import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import {
  JWT_EXPIRES_IN,
  JWT_ISSUER,
  JWT_AUDIENCE,
  JWT_ALGORITHM,
  JWT_MAX_AGE_SECONDS,
} from '@crm/auth-constants';
import type { JwtPayload, JwtVerifyResult } from '@crm/types';
import {
  revokeToken as dbRevokeToken,
  isTokenRevoked as dbIsTokenRevoked,
} from '@crm/db';
import { config } from './config.js';

export { JWT_MAX_AGE_SECONDS };

export function signJwt(claims: Omit<JwtPayload, 'iat' | 'exp' | 'jti'>): string {
  return jwt.sign(
    { ...claims, jti: randomUUID() },
    config.jwtSecret,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: JWT_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
  );
}

export function verifyJwt(token: string): JwtVerifyResult {
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as JwtPayload;
    return { ok: true, payload };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: false, reason: 'invalid' };
  }
}

export function decodeJwtUnchecked(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload | null;
  } catch {
    return null;
  }
}

export async function revokeJti(
  jti: string,
  exp: number,
  context?: { user_id?: string; org_id?: string; tenant_id?: string },
): Promise<void> {
  await dbRevokeToken({
    jti,
    expires_at: new Date(exp * 1000),
    reason: 'logout',
    ...(context?.user_id ? { user_id: context.user_id } : {}),
    ...(context?.org_id ? { org_id: context.org_id } : {}),
    ...(context?.tenant_id ? { tenant_id: context.tenant_id } : {}),
  });
}

export async function isJtiRevoked(
  jti: string,
  context?: { user_id?: string; org_id?: string; tenant_id?: string; issued_at?: number },
): Promise<boolean> {
  return dbIsTokenRevoked({
    jti,
    ...(context?.user_id ? { user_id: context.user_id } : {}),
    ...(context?.org_id ? { org_id: context.org_id } : {}),
    ...(context?.tenant_id ? { tenant_id: context.tenant_id } : {}),
    ...(context?.issued_at !== undefined ? { issued_at: context.issued_at } : {}),
  });
}
