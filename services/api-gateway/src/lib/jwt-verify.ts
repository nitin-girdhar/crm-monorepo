import { jwtVerify } from 'jose';
import { JWT_ISSUER, JWT_AUDIENCE } from '@crm/auth-constants';
import type { JwtPayload, JwtVerifyResult } from '@crm/types';
import { config } from '../config.js';
import { isTokenRevoked, revokeToken } from '@crm/db';

const encoder = new TextEncoder();

// DB-backed revocation — survives restarts and works across multiple instances.
// Supports revocation at JTI, user, org, and tenant level.
export async function revokeJti(
  jti: string,
  exp: number,
  payload: { user_id?: string; org_id?: string; tenant_id?: string },
): Promise<void> {
  await revokeToken({
    jti,
    expires_at: new Date(exp * 1000),
    ...(payload.user_id ? { user_id: payload.user_id } : {}),
    ...(payload.org_id ? { org_id: payload.org_id } : {}),
    ...(payload.tenant_id ? { tenant_id: payload.tenant_id } : {}),
  });
}

export async function verifyJwtEdge(token: string): Promise<JwtVerifyResult> {
  if (!config.jwtSecret) {
    return { ok: false, reason: 'invalid' };
  }

  try {
    const secret = encoder.encode(config.jwtSecret);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    const typed = payload as unknown as JwtPayload;

    if (typed.jti) {
      const revoked = await isTokenRevoked({
        jti: typed.jti,
        user_id: typed.sub,
        org_id: typed.org_id,
        tenant_id: typed.tenant_id,
        ...(typed.iat !== undefined ? { issued_at: typed.iat } : {}),
      });
      if (revoked) return { ok: false, reason: 'invalid' };
    }

    return { ok: true, payload: typed };
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'ERR_JWT_EXPIRED') return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'invalid' };
  }
}
