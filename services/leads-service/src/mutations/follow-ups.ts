import { withRoleTx } from '@crm/db';
import type { SqlParams, RoleTxContext } from '@crm/db';

export async function createFollowUp(
  org_id: string,
  user_id: string,
  lead_id: string,
  data: {
    assigned_user_id?: string | undefined;
    scheduled_at: string;
    notes?: string | undefined;
  },
  role = 'org_admin',
  tenant_id = '',
) {
  const ctx: RoleTxContext = { role, org_id, tenant_id, user_id };
  return withRoleTx(ctx, async (tx) => {
    const rows = await tx.unsafe(
      `INSERT INTO crm.lead_follow_ups (org_id, lead_id, assigned_user_id, scheduled_at, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [org_id, lead_id, data.assigned_user_id ?? user_id, data.scheduled_at, data.notes ?? null],
    );
    return (rows as unknown as Array<{ id: string }>)[0]!;
  });
}

export async function updateFollowUp(
  org_id: string,
  user_id: string,
  follow_up_id: string,
  data: { status_name?: string | undefined; completed_at?: string | undefined; scheduled_at?: string | undefined; notes?: string | undefined },
  role = 'org_admin',
  tenant_id = '',
) {
  const ctx: RoleTxContext = { role, org_id, tenant_id, user_id };
  return withRoleTx(ctx, async (tx) => {
    const sets: string[] = [];
    const params: unknown[] = [];

    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (data.completed_at !== undefined) add('completed_at', data.completed_at);
    if (data.scheduled_at !== undefined) add('scheduled_at', data.scheduled_at);
    if (data.notes !== undefined) add('notes', data.notes);

    if (data.status_name !== undefined) {
      const status_rows = await tx.unsafe(
        `SELECT id FROM crm.follow_up_statuses WHERE name = $1 LIMIT 1`,
        [data.status_name],
      );
      const status_id = (status_rows as unknown as Array<{ id: string }>)[0]?.id;
      if (!status_id) throw new Error(`Invalid status: ${data.status_name}`);
      add('status_id', status_id);
    }

    if (sets.length === 0) return null;

    params.push(follow_up_id, org_id);
    const rows = await tx.unsafe(
      `UPDATE crm.lead_follow_ups SET ${sets.join(', ')}
       WHERE id = $${params.length - 1} AND org_id = $${params.length} AND NOT is_deleted
       RETURNING id`,
      params as unknown as SqlParams,
    );
    return (rows as unknown as Array<{ id: string }>)[0] ?? null;
  });
}

export async function deleteFollowUp(
  org_id: string,
  user_id: string,
  follow_up_id: string,
  role = 'org_admin',
  tenant_id = '',
) {
  const ctx: RoleTxContext = { role, org_id, tenant_id, user_id };
  return withRoleTx(ctx, async (tx) => {
    await tx.unsafe(
      `UPDATE crm.lead_follow_ups
       SET is_deleted = TRUE, deleted_at = CLOCK_TIMESTAMP(), deleted_by = $1::uuid
       WHERE id = $2 AND org_id = $3`,
      [user_id, follow_up_id, org_id],
    );
  });
}
