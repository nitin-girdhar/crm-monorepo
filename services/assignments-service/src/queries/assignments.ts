import { withServiceTx, withOrgTx } from '@crm/db';

const ASSIGNMENT_SELECT = `
  SELECT
    ml.id               AS id,
    ml.id               AS lead_id,
    o.name              AS branch,
    ml.assigned_user_id AS assigned_to,
    u.full_name         AS assigned_rep_name,
    u.email             AS assigned_rep_email,
    ur.name             AS assigned_rep_role,
    ml.full_name        AS lead_full_name,
    ml.phone            AS lead_phone,
    ml.email            AS lead_email,
    ml.org_id,
    ls.name             AS lead_stage,
    ml.updated_at       AS assigned_at,
    COUNT(*) OVER ()    AS total_count
  FROM marketing_leads ml
  JOIN organizations o ON o.id = ml.org_id
  JOIN lead_stage ls ON ls.id = ml.stage_id
  JOIN users u ON u.id = ml.assigned_user_id
  LEFT JOIN user_roles ur ON ur.id = u.role_id
  WHERE NOT ml.is_deleted
    AND ml.assigned_user_id IS NOT NULL
`;

export async function listAllAssignments(
  org_ids: string[] | null,
  page = 1,
  page_size = 100,
) {
  const offset = (page - 1) * page_size;
  return withServiceTx(async (tx) => {
    let rows: unknown[];
    if (org_ids === null) {
      rows = await tx.unsafe(
        `${ASSIGNMENT_SELECT} ORDER BY ml.updated_at DESC LIMIT $1 OFFSET $2`,
        [page_size, offset],
      );
    } else {
      rows = await tx.unsafe(
        `${ASSIGNMENT_SELECT} AND ml.org_id = ANY($1::uuid[]) ORDER BY ml.updated_at DESC LIMIT $2 OFFSET $3`,
        [org_ids, page_size, offset],
      );
    }
    const typed = rows as Array<Record<string, unknown>>;
    const total = typed[0] ? Number(typed[0]['total_count'] ?? 0) : 0;
    return { assignments: typed, total, page, page_size };
  });
}

export async function getAssignmentById(id: string) {
  return withServiceTx(async (tx) => {
    const rows = await tx.unsafe(
      // Strip total_count from single-row fetch
      `SELECT
         ml.id, ml.id AS lead_id, o.name AS branch,
         ml.assigned_user_id AS assigned_to,
         u.full_name AS assigned_rep_name, u.email AS assigned_rep_email,
         ur.name AS assigned_rep_role,
         ml.full_name AS lead_full_name, ml.phone AS lead_phone, ml.email AS lead_email,
         ml.org_id, ls.name AS lead_stage, ml.updated_at AS assigned_at
       FROM marketing_leads ml
       JOIN organizations o ON o.id = ml.org_id
       JOIN lead_stage ls ON ls.id = ml.stage_id
       JOIN users u ON u.id = ml.assigned_user_id
       LEFT JOIN user_roles ur ON ur.id = u.role_id
       WHERE NOT ml.is_deleted AND ml.assigned_user_id IS NOT NULL AND ml.id = $1`,
      [id],
    );
    return (rows as Array<Record<string, unknown>>)[0] ?? null;
  });
}

export async function listMyAssignments(user_id: string, org_id: string, page = 1, page_size = 100) {
  const offset = (page - 1) * page_size;
  return withServiceTx(async (tx) => {
    const rows = await tx.unsafe(
      `${ASSIGNMENT_SELECT} AND ml.assigned_user_id = $1::uuid AND ml.org_id = $2::uuid
       ORDER BY ml.updated_at DESC LIMIT $3 OFFSET $4`,
      [user_id, org_id, page_size, offset],
    );
    const typed = rows as Array<Record<string, unknown>>;
    const total = typed[0] ? Number(typed[0]['total_count'] ?? 0) : 0;
    return { assignments: typed, total, page, page_size };
  });
}

export async function getUserByIdForAssignment(org_id: string, actor_user_id: string, user_id: string) {
  // Must use withOrgTx so the app_user RLS policy on the users table is active.
  // withServiceTx runs without a role switch, leaving no matching policy under
  // FORCE ROW LEVEL SECURITY → zero rows returned even for valid users.
  return withOrgTx(org_id, actor_user_id, async (tx) => {
    const rows = await tx.unsafe(
      `SELECT u.id, u.full_name, u.email, u.is_active, u.is_deleted,
              ur.rank, ur.name AS role_name
       FROM users u
       JOIN user_roles ur ON ur.id = u.role_id
       WHERE u.id = $1 AND NOT u.is_deleted`,
      [user_id],
    );
    return (rows as Array<Record<string, unknown>>)[0] ?? null;
  });
}
