import { withServiceTx } from '@crm/db';
import type { DatabaseUser } from '@crm/types';

// Base SELECT for home-org login (no org_id provided).
const USER_SELECT_HOME = `
  SELECT
    u.id, u.org_id, u.first_name, u.middle_name, u.last_name, u.full_name,
    u.email, u.mobile, u.password_hash, u.is_active, u.force_password_change,
    u.password_changed_at, u.last_login_at, u.manager_id, u.created_at, u.updated_at,
    u.is_deleted,
    ur.name   AS role_name,
    ur.label  AS role_label,
    ur.rank   AS rank,
    u.role_id AS role_id,
    m.full_name AS manager_name,
    o.name      AS org_name,
    o.tenant_id AS tenant_id,
    t.name      AS tenant_name
  FROM users u
  JOIN user_roles    ur ON ur.id = u.role_id
  JOIN organizations o  ON o.id  = u.org_id
  JOIN tenants       t  ON t.id  = o.tenant_id
  LEFT JOIN users    m  ON m.id  = u.manager_id
`;

// SELECT for org-scoped login: resolves role from user_org_mapping for the
// target org so the JWT carries the correct rank for the org being accessed.
// Access is allowed if the user's home org matches OR an active mapping exists.
const USER_SELECT_ORG = `
  SELECT
    u.id,
    $2::uuid                                AS org_id,
    u.first_name, u.middle_name, u.last_name, u.full_name,
    u.email, u.mobile, u.password_hash, u.is_active, u.force_password_change,
    u.password_changed_at, u.last_login_at, u.manager_id, u.created_at, u.updated_at,
    u.is_deleted,
    COALESCE(uom_r.name,  ur.name)  AS role_name,
    COALESCE(uom_r.label, ur.label) AS role_label,
    COALESCE(uom_r.rank,  ur.rank)  AS rank,
    COALESCE(uom_r.id,    ur.id)    AS role_id,
    m.full_name  AS manager_name,
    tgt.name     AS org_name,
    tgt.tenant_id AS tenant_id,
    t.name       AS tenant_name
  FROM users u
  JOIN user_roles    ur     ON ur.id  = u.role_id
  JOIN organizations home   ON home.id = u.org_id
  JOIN organizations tgt    ON tgt.id  = $2::uuid AND NOT tgt.is_deleted
  JOIN tenants       t      ON t.id    = home.tenant_id
  LEFT JOIN users    m      ON m.id    = u.manager_id
  LEFT JOIN user_org_mapping uom  ON uom.user_id = u.id
                                 AND uom.org_id  = $2::uuid
                                 AND uom.is_active
  LEFT JOIN user_roles       uom_r ON uom_r.id = uom.role_id
`;

export async function getUserByEmail(
  email: string,
  org_id?: string,
): Promise<DatabaseUser | null> {
  return withServiceTx(async (tx) => {
    if (org_id) {
      const rows = await tx.unsafe<DatabaseUser[]>(
        `${USER_SELECT_ORG}
         WHERE u.email = $1 AND NOT u.is_deleted
           AND (u.org_id = $2 OR uom.user_id IS NOT NULL)
         LIMIT 1`,
        [email, org_id],
      );
      return rows[0] ?? null;
    }
    const rows = await tx.unsafe<DatabaseUser[]>(
      `${USER_SELECT_HOME} WHERE u.email = $1 AND NOT u.is_deleted LIMIT 1`,
      [email],
    );
    return rows[0] ?? null;
  });
}

export async function getUserById(id: string): Promise<DatabaseUser | null> {
  return withServiceTx(async (tx) => {
    const rows = await tx.unsafe<DatabaseUser[]>(
      `${USER_SELECT_HOME} WHERE u.id = $1 AND NOT u.is_deleted LIMIT 1`,
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
