import type { ROLES } from '@crm/auth-constants';

export type UserRole = (typeof ROLES)[number];

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  rank: number;
  org_id: string;
  org_name: string;
  tenant_id: string;
  tenant_name: string;
  role_label: string;
  name: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  manager_id: string | null;
  manager_name: string | null;
  last_login_at: string | null;
  mobile: string | null;
  is_active: boolean;
  force_password_change: boolean;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  rank: number;
  org_id: string;
  tenant_id: string;
  pwd_iat: number;
  jti: string;
  /** Set to true when the user must change their password before any other action */
  force_password_change?: boolean;
  iat?: number;
  exp?: number;
}

export type JwtVerifyResult =
  | { ok: true; payload: JwtPayload }
  | { ok: false; reason: 'expired' | 'invalid' | 'missing' };
