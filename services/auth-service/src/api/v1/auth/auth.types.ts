import type { DatabaseUser, SessionUser } from '@crm/types';
import type { UserRole } from '@crm/auth-constants';

export type { DatabaseUser, SessionUser };

export function toSessionUser(row: DatabaseUser): SessionUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role_name as UserRole,
    rank: row.rank,
    org_id: row.org_id,
    org_name: row.org_name,
    tenant_id: row.tenant_id,
    tenant_name: row.tenant_name,
    role_label: row.role_label,
    name: row.full_name,
    first_name: row.first_name,
    middle_name: row.middle_name,
    last_name: row.last_name,
    manager_id: row.manager_id,
    manager_name: row.manager_name,
    last_login_at: row.last_login_at ? new Date(row.last_login_at as unknown as string).toISOString() : null,
    mobile: row.mobile,
    is_active: row.is_active,
    force_password_change: row.force_password_change,
  };
}
