import bcrypt from 'bcryptjs';
import { withRoleTx, withServiceTx } from '@crm/db';
import type { SqlParams, RoleTxContext } from '@crm/db';
import { config } from '../config.js';

const ALLOWED_LOOKUP_TABLES = new Set(['iam.user_roles']);

async function resolveLookupId(table: string, name: string): Promise<string> {
  if (!ALLOWED_LOOKUP_TABLES.has(table)) {
    throw new Error(`Invalid lookup table: ${table}`);
  }
  return withServiceTx(async (tx) => {
    const rows = await tx.unsafe<{ id: string }[]>(
      `SELECT id FROM ${table} WHERE name = $1 LIMIT 1`,
      [name],
    );
    const row = rows[0];
    if (!row) throw new Error(`${table} lookup not found: ${name}`);
    return row.id;
  });
}

export interface CreateUserData {
  first_name: string;
  middle_name?: string | undefined;
  last_name?: string | undefined;
  email: string;
  mobile?: string | undefined;
  role_name: string;
  manager_id?: string | undefined;
  force_password_change?: boolean | undefined;
  password: string;
}

export async function createUser(
  org_id: string,
  actor_user_id: string,
  data: CreateUserData,
  role = 'org_admin',
  tenant_id = '',
) {
  const ctx: RoleTxContext = { role, org_id, tenant_id, user_id: actor_user_id };
  return withRoleTx(ctx, async (tx) => {
    const role_id = await resolveLookupId('iam.user_roles', data.role_name);
    const password_hash = await bcrypt.hash(data.password, config.bcryptRounds);

    const rows = await tx.unsafe(
      `INSERT INTO iam.users
         (org_id, first_name, middle_name, last_name, email, mobile, role_id,
          manager_id, password_hash, password_changed_at, is_active, force_password_change)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CLOCK_TIMESTAMP(), $10, $11)
       RETURNING id`,
      [
        org_id,
        data.first_name,
        data.middle_name ?? null,
        data.last_name ?? '',
        data.email,
        data.mobile ?? null,
        role_id,
        data.manager_id ?? null,
        password_hash,
        true,
        data.force_password_change ?? true,
      ],
    );
    const created = rows[0] as unknown as { id: string };

    // Seed iam.user_org_mapping so RLS and multi-org queries work immediately.
    await tx.unsafe(
      `INSERT INTO iam.user_org_mapping (user_id, org_id, role_id, granted_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, org_id) DO UPDATE
         SET role_id    = EXCLUDED.role_id,
             is_active  = TRUE,
             updated_at = CLOCK_TIMESTAMP()`,
      [created.id, org_id, role_id, actor_user_id],
    );

    return created;
  });
}

export interface UpdateUserData {
  first_name?: string | undefined;
  middle_name?: string | undefined;
  last_name?: string | undefined;
  email?: string | undefined;
  mobile?: string | undefined;
  role_name?: string | undefined;
  manager_id?: string | null | undefined;
  is_active?: boolean | undefined;
  force_password_change?: boolean | undefined;
  password?: string | undefined;
}

export async function updateUser(
  org_id: string,
  actor_user_id: string,
  target_user_id: string,
  data: UpdateUserData,
  role = 'org_admin',
  tenant_id = '',
) {
  const ctx: RoleTxContext = { role, org_id, tenant_id, user_id: actor_user_id };
  return withRoleTx(ctx, async (tx) => {
    const sets: string[] = [];
    const params: unknown[] = [];

    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (data.first_name !== undefined) add('first_name', data.first_name);
    if (data.last_name !== undefined) add('last_name', data.last_name);
    if (data.middle_name !== undefined) add('middle_name', data.middle_name);
    if (data.email !== undefined) add('email', data.email);
    if (data.mobile !== undefined) add('mobile', data.mobile);
    if (data.is_active !== undefined) add('is_active', data.is_active);
    if (data.force_password_change !== undefined) add('force_password_change', data.force_password_change);
    if (data.manager_id !== undefined) add('manager_id', data.manager_id);

    if (data.role_name !== undefined) {
      const role_id = await resolveLookupId('iam.user_roles', data.role_name);
      add('role_id', role_id);
      add('password_changed_at', new Date());
    }

    if (data.password !== undefined) {
      const hash = await bcrypt.hash(data.password, config.bcryptRounds);
      add('password_hash', hash);
      add('password_changed_at', new Date());
    }

    if (sets.length === 0) return null;

    params.push(target_user_id, org_id);
    const rows = await tx.unsafe(
      `UPDATE iam.users SET ${sets.join(', ')}
       WHERE id = $${params.length - 1} AND org_id = $${params.length} AND NOT is_deleted
       RETURNING id, password_changed_at, role_id`,
      params as unknown as SqlParams,
    );
    const updated = (rows as unknown as Array<Record<string, unknown>>)[0] ?? null;

    // Keep iam.user_org_mapping in sync when the role changes for this org.
    if (updated && data.role_name !== undefined) {
      await tx.unsafe(
        `UPDATE iam.user_org_mapping SET role_id = $1, updated_at = CLOCK_TIMESTAMP()
         WHERE user_id = $2 AND org_id = $3`,
        [updated['role_id'], target_user_id, org_id] as unknown as SqlParams,
      );
    }

    return updated;
  });
}

export async function softDeleteUser(
  org_id: string,
  actor_user_id: string,
  target_user_id: string,
  role = 'org_admin',
  tenant_id = '',
) {
  const ctx: RoleTxContext = { role, org_id, tenant_id, user_id: actor_user_id };
  return withRoleTx(ctx, async (tx) => {
    await tx.unsafe(
      `UPDATE iam.users
       SET is_deleted = TRUE, is_active = FALSE,
           deleted_at = CLOCK_TIMESTAMP(), deleted_by = $1::uuid
       WHERE id = $2 AND org_id = $3`,
      [actor_user_id, target_user_id, org_id],
    );
    // Revoke all org mappings so the user can no longer access any org.
    await tx.unsafe(
      `UPDATE iam.user_org_mapping SET is_active = FALSE, updated_at = CLOCK_TIMESTAMP()
       WHERE user_id = $1`,
      [target_user_id],
    );
  });
}

export async function adminResetPassword(
  org_id: string,
  actor_user_id: string,
  target_user_id: string,
  temporary_password: string,
  role = 'org_admin',
  tenant_id = '',
) {
  const ctx: RoleTxContext = { role, org_id, tenant_id, user_id: actor_user_id };
  return withRoleTx(ctx, async (tx) => {
    const hash = await bcrypt.hash(temporary_password, config.bcryptRounds);
    const rows = await tx.unsafe(
      `UPDATE iam.users
       SET password_hash = $1, password_changed_at = CLOCK_TIMESTAMP(), force_password_change = TRUE
       WHERE id = $2 AND org_id = $3 AND NOT is_deleted
       RETURNING id`,
      [hash, target_user_id, org_id],
    );
    return rows[0] ?? null;
  });
}
