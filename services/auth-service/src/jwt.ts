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
import { config } from './config.js';

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

// Decode without verification — used only to extract jti from a token whose
// signature has already been verified by the caller.
export function decodeJwtUnchecked(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload | null;
  } catch {
    return null;
  }
}

// In-memory revocation list.
// NOTE: Does not survive process restarts and is not shared across instances.
// For multi-instance deployments, replace with a Redis SET keyed by jti with TTL.
const _revoked = new Map<string, number>(); // jti → expiry epoch ms

export function revokeJti(jti: string, exp: number): void {
  _revoked.set(jti, exp * 1000);
}

export function isJtiRevoked(jti: string): boolean {
  const exp = _revoked.get(jti);
  if (exp === undefined) return false;
  if (Date.now() > exp) {
    _revoked.delete(jti);
    return false;
  }
  return true;
}

// Prune expired entries every 15 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [jti, exp] of _revoked) {
    if (now > exp) _revoked.delete(jti);
  }
}, 15 * 60 * 1000).unref();
