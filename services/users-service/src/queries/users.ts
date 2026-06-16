import { withOrgTx, withServiceTx } from '@crm/db';
import type { SqlParams } from '@crm/db';

export async function listUsers(
  org_id: string,
  actor_user_id: string,
  page = 1,
  page_size = 100,
) {
  const offset = (page - 1) * page_size;
  return withOrgTx(org_id, actor_user_id, async (tx) => {
    const rows = await tx.unsafe(
      `SELECT u.id, u.org_id, u.first_name, u.middle_name, u.last_name, u.full_name,
              u.email, u.mobile, u.is_active, u.force_password_change,
              u.password_changed_at, u.last_login_at, u.manager_id, u.created_at, u.updated_at,
              ur.name  AS role_name,
              ur.label AS role_label,
              ur.rank,
              m.full_name AS manager_name,
              COUNT(ml.id) FILTER (WHERE NOT ml.is_deleted) AS assigned_leads_count,
              COUNT(*) OVER () AS total_count
       FROM users u
       JOIN user_roles ur ON ur.id = u.role_id
       LEFT JOIN users m  ON m.id = u.manager_id
       LEFT JOIN marketing_leads ml ON ml.assigned_user_id = u.id
       WHERE u.org_id = $1 AND NOT u.is_deleted
       GROUP BY u.id, ur.name, ur.label, ur.rank, m.full_name
       ORDER BY ur.rank DESC, u.full_name
       LIMIT $2 OFFSET $3`,
      [org_id, page_size, offset],
    );
    const typed = rows as Array<Record<string, unknown>>;
    const total = typed[0] ? Number(typed[0]['total_count'] ?? 0) : 0;
    return { users: typed, total, page, page_size };
  });
}

export async function getUserById(org_id: string, actor_user_id: string, target_user_id: string) {
  return withOrgTx(org_id, actor_user_id, async (tx) => {
    const rows = await tx.unsafe(
      `SELECT u.id, u.org_id, u.first_name, u.middle_name, u.last_name, u.full_name,
              u.email, u.mobile, u.is_active, u.force_password_change,
              u.password_changed_at, u.last_login_at, u.manager_id, u.created_at, u.updated_at,
              ur.name  AS role_name,
              ur.label AS role_label,
              ur.rank,
              m.full_name AS manager_name
       FROM users u
       JOIN user_roles ur ON ur.id = u.role_id
       LEFT JOIN users m  ON m.id = u.manager_id
       WHERE u.id = $1 AND u.org_id = $2 AND NOT u.is_deleted`,
      [target_user_id, org_id],
    );
    return (rows as Array<Record<string, unknown>>)[0] ?? null;
  });
}

export async function getUserByIdAsService(user_id: string) {
  return withServiceTx(async (tx) => {
    const rows = await tx.unsafe(
      `SELECT u.id, u.org_id, u.first_name, u.middle_name, u.last_name, u.full_name,
              u.email, u.mobile, u.is_active, u.force_password_change,
              u.password_changed_at, u.last_login_at, u.manager_id, u.created_at, u.updated_at,
              ur.name  AS role_name,
              ur.label AS role_label,
              ur.rank,
              m.full_name AS manager_name
       FROM users u
       JOIN user_roles ur ON ur.id = u.role_id
       LEFT JOIN users m  ON m.id = u.manager_id
       WHERE u.id = $1 AND NOT u.is_deleted`,
      [user_id],
    );
    return (rows as Array<Record<string, unknown>>)[0] ?? null;
  });
}

export async function getAssignableUsers(org_id: string, actor_user_id: string, actor_rank: number) {
  return withOrgTx(org_id, actor_user_id, async (tx) => {
    return tx.unsafe(
      `SELECT u.id, u.org_id, u.full_name, u.first_name, u.middle_name, u.last_name,
              u.email, u.is_active,
              ur.name AS role_name, ur.label AS role_label, ur.rank
       FROM users u
       JOIN user_roles ur ON ur.id = u.role_id
       WHERE u.org_id = $1 AND NOT u.is_deleted AND u.is_active AND ur.rank < $2
       ORDER BY ur.rank DESC, u.full_name`,
      [org_id, actor_rank],
    );
  });
}

export async function getTeamMembers(org_id: string, manager_id: string) {
  return withOrgTx(org_id, manager_id, async (tx) => {
    return tx.unsafe(
      `SELECT id, full_name, email, role_name, role_label, rank, manager_id
       FROM vw_user_team_members
       WHERE org_id = $1 AND manager_id = $2
       ORDER BY rank DESC, full_name`,
      [org_id, manager_id],
    );
  });
}

export async function getOrgChart(org_id: string, user_id: string) {
  return withOrgTx(org_id, user_id, async (tx) => {
    return tx.unsafe(
      `SELECT id, full_name, email, manager_id, manager_name, role_name, role_label, rank
       FROM vw_user_org_chart
       WHERE org_id = $1
       ORDER BY rank DESC, full_name`,
      [org_id],
    );
  });
}

export async function getBranches(
  org_id: string,
  role: string,
  locationFilter?: { cityIds?: number[]; stateIds?: number[]; countryIds?: number[] },
) {
  const is_tenant_wide = role === 'tenant_admin' || role === 'super_admin';
  return withServiceTx(async (tx) => {
    const scopeFilter = is_tenant_wide
      ? `o.tenant_id = (SELECT tenant_id FROM organizations WHERE id = $1::uuid)`
      : `o.id = $1::uuid`;

    const extraParams: unknown[] = [];
    let locationClause = '';
    const { cityIds = [], stateIds = [], countryIds = [] } = locationFilter ?? {};
    if (cityIds.length) {
      extraParams.push(cityIds);
      locationClause = `AND o.city_id = ANY($${extraParams.length + 1}::int[])`;
    } else if (stateIds.length) {
      extraParams.push(stateIds);
      locationClause = `AND o.state_id = ANY($${extraParams.length + 1}::int[])`;
    } else if (countryIds.length) {
      extraParams.push(countryIds);
      locationClause = `AND o.country_id = ANY($${extraParams.length + 1}::int[])`;
    }

    return tx.unsafe(
      `SELECT o.id, o.name,
              o.city_id    AS "cityId",
              o.state_id   AS "stateId",
              o.country_id AS "countryId"
       FROM organizations o
       WHERE ${scopeFilter}
         AND NOT o.is_deleted
         AND o.is_active
         ${locationClause}
       ORDER BY o.name`,
      [org_id, ...extraParams] as unknown as SqlParams,
    );
  });
}

export async function getAllBranches(org_id: string) {
  return withServiceTx(async (tx) => {
    return tx.unsafe(
      `SELECT o.id, o.name,
              o.city_id    AS "cityId",
              o.state_id   AS "stateId",
              o.country_id AS "countryId"
       FROM organizations o
       WHERE o.id = $1 AND NOT o.is_deleted AND o.is_active
       ORDER BY o.name`,
      [org_id],
    );
  });
}

export async function getLeadSources() {
  return withServiceTx(async (tx) => {
    return tx.unsafe(`SELECT id, name FROM lead_sources ORDER BY name`);
  });
}
