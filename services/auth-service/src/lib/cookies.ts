import { AUTH_COOKIE_NAME, JWT_MAX_AGE_SECONDS } from '@crm/auth-constants';
import { config } from '../config/index.js';

export interface CookieOptions {
  httpOnly: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  secure: boolean;
  path: string;
  maxAge: number;
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
    maxAge: JWT_MAX_AGE_SECONDS,
  };
}

export function clearedSessionCookieOptions(): CookieOptions {
  return {
    ...sessionCookieOptions(),
    maxAge: 0,
  };
}

export { AUTH_COOKIE_NAME };
