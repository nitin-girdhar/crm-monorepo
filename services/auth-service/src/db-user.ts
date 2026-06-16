import { withServiceTx } from '@crm/db';
import type { DatabaseUser } from '@crm/types';

const USER_SELECT = `
  SELECT
    u.id, u.org_id, u.first_name, u.middle_name, u.last_name, u.full_name,
    u.email, u.mobile, u.password_hash, u.is_active, u.force_password_change,
    u.password_changed_at, u.last_login_at, u.manager_id, u.created_at, u.updated_at,
    u.is_deleted,
    ur.name   AS role_name,
    ur.label  AS role_label,
    ur.rank   AS rank,
    m.full_name AS manager_name,
    o.name    AS org_name,
    o.tenant_id AS tenant_id,
    t.name    AS tenant_name,
    u.role_id AS role_id
  FROM users u
  JOIN user_roles    ur ON ur.id = u.role_id
  JOIN organizations o  ON o.id  = u.org_id
  JOIN tenants       t  ON t.id  = o.tenant_id
  LEFT JOIN users    m  ON m.id  = u.manager_id
`;

export async function getUserByEmail(
  email: string,
  org_id?: string,
): Promise<DatabaseUser | null> {
  return withServiceTx(async (tx) => {
    const rows = org_id
      ? await tx.unsafe<DatabaseUser[]>(
          `${USER_SELECT} WHERE u.email = $1 AND u.org_id = $2 AND NOT u.is_deleted LIMIT 1`,
          [email, org_id],
        )
      : await tx.unsafe<DatabaseUser[]>(
          `${USER_SELECT} WHERE u.email = $1 AND NOT u.is_deleted LIMIT 1`,
          [email],
        );
    return rows[0] ?? null;
  });
}

export async function getUserById(id: string): Promise<DatabaseUser | null> {
  return withServiceTx(async (tx) => {
    const rows = await tx.unsafe<DatabaseUser[]>(
      `${USER_SELECT} WHERE u.id = $1 AND NOT u.is_deleted LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  });
}

export async function updateLastLogin(user_id: string): Promise<void> {
  await withServiceTx(async (tx) => {
    await tx.unsafe(
      `UPDATE users SET last_login_at = CLOCK_TIMESTAMP() WHERE id = $1`,
      [user_id],
    );
  });
}
