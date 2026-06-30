import { sql, eq, and } from 'drizzle-orm';
import { withRoleTx, withServiceTx } from '@crm/db';
import type { RoleTxContext } from '@crm/db';
import {
  usersTable,
  userRolesTable,
  userOrgMappingTable,
  vwUserTeamMembers,
  vwUserOrgChart,
} from '@crm/db/schema';
import { RANKS } from '@crm/permissions';
import { BadRequestError } from '../../../lib/errors.js';

export async function listUsers(ctx: RoleTxContext, page: number, pageSize: number) {
  const offset = (page - 1) * pageSize;
  return withRoleTx(ctx, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT u.id, u.org_id, u.first_name, u.middle_name, u.last_name, u.full_name,
             u.email, u.mobile, u.is_active, u.force_password_change,
             u.password_changed_at, u.last_login_at, u.manager_id, u.created_at, u.updated_at,
             ur.name  AS role_name,
             ur.label AS role_label,
             ur.rank,
             m.full_name AS manager_name,
             o.name AS org_name,
             COUNT(ml.id) FILTER (WHERE NOT ml.is_deleted) AS assigned_leads_count,
             COUNT(*) OVER () AS total_count
      FROM iam.user_org_mapping uom
      JOIN iam.users u       ON u.id   = uom.user_id
      JOIN iam.user_roles ur ON ur.id  = uom.role_id
      JOIN entity.organizations o ON o.id = u.org_id
      LEFT JOIN iam.users m  ON m.id   = u.manager_id
      LEFT JOIN crm.marketing_leads ml ON ml.assigned_user_id = u.id
      WHERE uom.org_id = ${ctx.org_id}::uuid AND uom.is_active AND NOT u.is_deleted
      GROUP BY u.id, uom.role_id, ur.name, ur.label, ur.rank, m.full_name, o.name
      ORDER BY ur.rank DESC, u.full_name
      LIMIT ${pageSize} OFFSET ${offset}
    `)) as Array<Record<string, unknown>>;
    const total = rows[0] ? Number(rows[0]['total_count'] ?? 0) : 0;
    return { users: rows, total, page, page_size: pageSize };
  });
}

export async function getUserById(ctx: RoleTxContext, targetUserId: string) {
  return withRoleTx(ctx, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT u.id, u.org_id, u.first_name, u.middle_name, u.last_name, u.full_name,
             u.email, u.mobile, u.is_active, u.force_password_change,
             u.password_changed_at, u.last_login_at, u.manager_id, u.created_at, u.updated_at,
             ur.name  AS role_name,
             ur.label AS role_label,
             ur.rank,
             m.full_name AS manager_name
      FROM iam.users u
      JOIN iam.user_org_mapping uom ON uom.user_id = u.id AND uom.org_id = ${ctx.org_id}::uuid AND uom.is_active
      JOIN iam.user_roles ur        ON ur.id = uom.role_id
      LEFT JOIN iam.users m         ON m.id  = u.manager_id
      WHERE u.id = ${targetUserId}::uuid AND NOT u.is_deleted
    `)) as Array<Record<string, unknown>>;
    return rows[0] ?? null;
  });
}

export async function getUserByIdAsService(userId: string) {
  return withServiceTx(async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT u.id, u.org_id, u.first_name, u.middle_name, u.last_name, u.full_name,
             u.email, u.mobile, u.is_active, u.force_password_change,
             u.password_changed_at, u.last_login_at, u.manager_id, u.created_at, u.updated_at,
             ur.name  AS role_name,
             ur.label AS role_label,
             ur.rank,
             m.full_name AS manager_name
      FROM iam.users u
      JOIN iam.user_roles ur ON ur.id = u.role_id
      LEFT JOIN iam.users m  ON m.id = u.manager_id
      WHERE u.id = ${userId}::uuid AND NOT u.is_deleted
    `)) as Array<Record<string, unknown>>;
    return rows[0] ?? null;
  });
}

export async function getAssignmentWeights(ctx: RoleTxContext) {
  return withRoleTx(ctx, async (tx) => {
    return (await tx.execute(sql`
      SELECT u.id AS user_id, u.full_name, u.email,
             ur.name AS role_name, ur.label AS role_label, ur.rank,
             uom.lead_assignment_weight AS weight
      FROM iam.user_org_mapping uom
      JOIN iam.users u       ON u.id  = uom.user_id
      JOIN iam.user_roles ur ON ur.id = uom.role_id
      WHERE uom.org_id = ${ctx.org_id}::uuid AND uom.is_active AND NOT u.is_deleted AND u.is_active
        AND ur.rank > ${RANKS.READ_ONLY} AND ur.rank < ${RANKS.ADMIN}
      ORDER BY ur.rank DESC, u.full_name
    `)) as Array<Record<string, unknown>>;
  });
}

export async function updateAssignmentWeights(
  ctx: RoleTxContext,
  weights: Array<{ user_id: string; weight: number }>,
) {
  return withRoleTx(ctx, async (tx) => {
    const userIds = weights.map((w) => w.user_id);

    // Confirm every targeted user is actually eligible (active mapping, in-range rank)
    // in this org before writing anything — prevents setting a weight on a user who
    // wouldn't be picked by resolveAutoAssignedUser anyway.
    const eligible = (await tx.execute(sql`
      SELECT uom.user_id
      FROM iam.user_org_mapping uom
      JOIN iam.user_roles ur ON ur.id = uom.role_id
      WHERE uom.org_id = ${ctx.org_id}::uuid AND uom.is_active
        AND ur.rank > ${RANKS.READ_ONLY} AND ur.rank < ${RANKS.ADMIN}
        AND uom.user_id = ANY(${userIds}::uuid[])
    `)) as Array<{ user_id: string }>;
    const eligibleIds = new Set(eligible.map((r) => r.user_id));
    const ineligible = userIds.filter((id) => !eligibleIds.has(id));
    if (ineligible.length > 0) {
      throw new BadRequestError(`Users not eligible for lead assignment in this org: ${ineligible.join(', ')}`);
    }

    const sum = weights.reduce((s, w) => s + w.weight, 0);
    if (sum !== 100 && sum !== 0) {
      throw new BadRequestError(`Assignment weights must sum to 100 (or 0 to disable auto-assignment), got ${sum}`);
    }

    for (const w of weights) {
      await tx.execute(sql`
        UPDATE iam.user_org_mapping
        SET lead_assignment_weight = ${w.weight}, updated_at = NOW()
        WHERE user_id = ${w.user_id}::uuid AND org_id = ${ctx.org_id}::uuid
      `);
    }
  });
}

export async function getAssignableUsers(ctx: RoleTxContext, actorRank: number) {
  return withRoleTx(ctx, async (tx) => {
    return (await tx.execute(sql`
      SELECT u.id, u.org_id, u.full_name, u.first_name, u.middle_name, u.last_name,
             u.email, u.is_active,
             ur.name AS role_name, ur.label AS role_label, ur.rank
      FROM iam.user_org_mapping uom
      JOIN iam.users u       ON u.id  = uom.user_id
      JOIN iam.user_roles ur ON ur.id = uom.role_id
      WHERE uom.org_id = ${ctx.org_id}::uuid AND uom.is_active AND NOT u.is_deleted AND u.is_active
        AND ur.rank < ${actorRank}
      ORDER BY ur.rank DESC, u.full_name
    `)) as Array<Record<string, unknown>>;
  });
}

export async function getTeamMembers(ctx: RoleTxContext) {
  return withRoleTx(ctx, async (tx) => {
    return tx.select({
      managerId:      vwUserTeamMembers.managerId,
      memberId:       vwUserTeamMembers.memberId,
      memberFullName: vwUserTeamMembers.memberFullName,
      memberEmail:    vwUserTeamMembers.memberEmail,
      memberRole:     vwUserTeamMembers.memberRole,
      depth:          vwUserTeamMembers.depth,
      isActive:       vwUserTeamMembers.isActive,
    })
      .from(vwUserTeamMembers)
      .where(
        and(
          eq(vwUserTeamMembers.orgId, ctx.org_id),
          eq(vwUserTeamMembers.managerId, ctx.user_id),
        ),
      );
  });
}

export async function getOrgChart(ctx: RoleTxContext) {
  return withRoleTx(ctx, async (tx) => {
    return tx.select({
      userId:          vwUserOrgChart.userId,
      fullName:        vwUserOrgChart.fullName,
      email:           vwUserOrgChart.email,
      managerId:       vwUserOrgChart.managerId,
      managerFullName: vwUserOrgChart.managerFullName,
      roleName:        vwUserOrgChart.roleName,
      hierarchyLevel:  vwUserOrgChart.hierarchyLevel,
    })
      .from(vwUserOrgChart)
      .where(eq(vwUserOrgChart.orgId, ctx.org_id));
  });
}

export interface CreateUserData {
  first_name: string;
  middle_name?: string;
  last_name?: string;
  email: string;
  mobile?: string;
  role_name: string;
  manager_id?: string;
  force_password_change?: boolean;
  password_hash: string;
}

export async function resolveRoleByName(roleName: string) {
  return withServiceTx(async (tx) => {
    const [row] = await tx
      .select({ id: userRolesTable.id })
      .from(userRolesTable)
      .where(eq(userRolesTable.name, roleName))
      .limit(1);
    return row ?? null;
  });
}

export async function createUser(ctx: RoleTxContext, data: CreateUserData) {
  return withRoleTx(ctx, async (tx) => {
    const [roleRow] = await tx
      .select({ id: userRolesTable.id })
      .from(userRolesTable)
      .where(eq(userRolesTable.name, data.role_name))
      .limit(1);
    if (!roleRow) throw new BadRequestError(`Role not found: ${data.role_name}`);
    const roleId = roleRow.id;

    const rows = (await tx.execute(sql`
      INSERT INTO iam.users
        (org_id, first_name, middle_name, last_name, email, mobile, role_id,
         manager_id, password_hash, password_changed_at, is_active, force_password_change)
      VALUES (
        ${ctx.org_id}::uuid,
        ${data.first_name},
        ${data.middle_name ?? null},
        ${data.last_name ?? ''},
        ${data.email},
        ${data.mobile ?? null},
        ${roleId}::uuid,
        ${data.manager_id ? sql`${data.manager_id}::uuid` : sql`NULL`},
        ${data.password_hash},
        CLOCK_TIMESTAMP(),
        TRUE,
        ${data.force_password_change ?? true}
      )
      RETURNING id
    `)) as Array<{ id: string }>;
    const created = rows[0]!;

    await tx
      .insert(userOrgMappingTable)
      .values({
        userId:    created.id,
        orgId:     ctx.org_id,
        roleId,
        grantedBy: ctx.user_id,
      })
      .onConflictDoUpdate({
        target: [userOrgMappingTable.userId, userOrgMappingTable.orgId],
        set: { roleId, isActive: true, updatedAt: new Date() },
      });

    return created;
  });
}

export interface UpdateUserFields {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  email?: string;
  mobile?: string;
  is_active?: boolean;
  force_password_change?: boolean;
  manager_id?: string | null;
  role_id?: string;
  password_hash?: string;
  password_changed_at?: Date;
}

export async function updateUser(
  ctx: RoleTxContext,
  targetUserId: string,
  fields: UpdateUserFields,
) {
  return withRoleTx(ctx, async (tx) => {
    const chunks: ReturnType<typeof sql>[] = [];

    if (fields.first_name !== undefined)          chunks.push(sql`first_name = ${fields.first_name}`);
    if (fields.last_name !== undefined)           chunks.push(sql`last_name = ${fields.last_name}`);
    if (fields.middle_name !== undefined)         chunks.push(sql`middle_name = ${fields.middle_name}`);
    if (fields.email !== undefined)               chunks.push(sql`email = ${fields.email}`);
    if (fields.mobile !== undefined)              chunks.push(sql`mobile = ${fields.mobile}`);
    if (fields.is_active !== undefined)           chunks.push(sql`is_active = ${fields.is_active}`);
    if (fields.force_password_change !== undefined) chunks.push(sql`force_password_change = ${fields.force_password_change}`);
    if (fields.manager_id !== undefined)          chunks.push(sql`manager_id = ${fields.manager_id}`);
    if (fields.role_id !== undefined)             chunks.push(sql`role_id = ${fields.role_id}::uuid`);
    if (fields.password_hash !== undefined)       chunks.push(sql`password_hash = ${fields.password_hash}`);
    if (fields.password_changed_at !== undefined) chunks.push(sql`password_changed_at = ${fields.password_changed_at}`);

    if (chunks.length === 0) return null;

    const setClause = sql.join(chunks, sql`, `);
    const rows = (await tx.execute(sql`
      UPDATE iam.users
      SET ${setClause}
      WHERE id = ${targetUserId}::uuid AND org_id = ${ctx.org_id}::uuid AND NOT is_deleted
      RETURNING id, password_changed_at, role_id
    `)) as Array<Record<string, unknown>>;
    return rows[0] ?? null;
  });
}

export async function syncOrgMappingRole(ctx: RoleTxContext, userId: string, roleId: string) {
  return withRoleTx(ctx, async (tx) => {
    await tx
      .update(userOrgMappingTable)
      .set({ roleId, updatedAt: new Date() })
      .where(
        and(
          eq(userOrgMappingTable.userId, userId),
          eq(userOrgMappingTable.orgId, ctx.org_id),
        ),
      );
  });
}

export async function softDeleteUser(ctx: RoleTxContext, targetUserId: string) {
  return withRoleTx(ctx, async (tx) => {
    await tx.execute(sql`
      UPDATE iam.users
      SET is_deleted = TRUE, is_active = FALSE,
          deleted_at = CLOCK_TIMESTAMP(), deleted_by = ${ctx.user_id}::uuid
      WHERE id = ${targetUserId}::uuid AND org_id = ${ctx.org_id}::uuid
    `);
    await tx
      .update(userOrgMappingTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(userOrgMappingTable.userId, targetUserId));
  });
}

export async function adminResetPassword(
  ctx: RoleTxContext,
  targetUserId: string,
  passwordHash: string,
) {
  return withRoleTx(ctx, async (tx) => {
    const rows = (await tx.execute(sql`
      UPDATE iam.users
      SET password_hash = ${passwordHash},
          password_changed_at = CLOCK_TIMESTAMP(),
          force_password_change = TRUE
      WHERE id = ${targetUserId}::uuid AND org_id = ${ctx.org_id}::uuid AND NOT is_deleted
      RETURNING id
    `)) as Array<{ id: string }>;
    return rows[0] ?? null;
  });
}
