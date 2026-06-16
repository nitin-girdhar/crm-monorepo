import { jwtVerify } from 'jose';
import { JWT_ISSUER, JWT_AUDIENCE } from '@crm/auth-constants';
import type { JwtPayload, JwtVerifyResult } from '@crm/types';
import { config } from '../config.js';

const encoder = new TextEncoder();

// In-memory revocation list — mirrors auth-service's list.
// NOTE: For multi-instance deployments replace with Redis.
// Populated by the logout route interceptor in server.ts.
const _revoked = new Map<string, number>(); // jti → expiry epoch ms

export function revokeJti(jti: string, exp: number): void {
  _revoked.set(jti, exp * 1000);
}

function isRevoked(jti: string): boolean {
  const exp = _revoked.get(jti);
  if (exp === undefined) return false;
  if (Date.now() > exp) {
    _revoked.delete(jti);
    return false;
  }
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [jti, exp] of _revoked) {
    if (now > exp) _revoked.delete(jti);
  }
}, 15 * 60 * 1000).unref();

export async function verifyJwtEdge(token: string): Promise<JwtVerifyResult> {
  try {
    const secret = encoder.encode(config.jwtSecret);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    const typed = payload as unknown as JwtPayload;

    if (typed.jti && isRevoked(typed.jti)) {
      return { ok: false, reason: 'invalid' };
    }

    return { ok: true, payload: typed };
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'ERR_JWT_EXPIRED') return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'invalid' };
  }
}
