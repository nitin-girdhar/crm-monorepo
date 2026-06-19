import { withRoleTx } from '@crm/db';
import type { Tx, SqlParams, RoleTxContext } from '@crm/db';

const ALLOWED_LOOKUP_TABLES = new Set(['marketing_platforms', 'campaign_statuses']);

async function resolveLookupId(tx: Tx, table: string, name: string): Promise<string> {
  if (!ALLOWED_LOOKUP_TABLES.has(table)) {
    throw new Error(`Invalid lookup table: ${table}`);
  }
  const rows = await tx.unsafe(
    `SELECT id FROM ${table} WHERE name = $1 LIMIT 1`,
    [name],
  );
  const row = (rows as unknown as Array<{ id: string }>)[0];
  if (!row) throw new Error(`${table} lookup not found: ${name}`);
  return row.id;
}

export async function createCampaign(
  org_id: string,
  user_id: string,
  data: Record<string, unknown>,
  role = 'org_admin',
  tenant_id = '',
) {
  const ctx: RoleTxContext = { role, org_id, tenant_id, user_id };
  return withRoleTx(ctx, async (tx) => {
    const platform_id = await resolveLookupId(tx, 'marketing_platforms', String(data['platform_name'] ?? ''));
    const status_id = await resolveLookupId(tx, 'campaign_statuses', String(data['status_name'] ?? 'draft'));

    const rows = await tx.unsafe(
      `INSERT INTO ad_campaigns (org_id, name, platform_id, status_id, budget, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        org_id,
        String(data['name']),
        platform_id,
        status_id,
        data['budget'] ? Number(data['budget']) : null,
        data['started_at'] !== undefined ? String(data['started_at']) : null,
        data['ended_at'] !== undefined ? String(data['ended_at']) : null,
      ] as unknown as SqlParams,
    );
    return (rows as unknown as Array<{ id: string }>)[0]!;
  });
}

export async function updateCampaign(
  org_id: string,
  user_id: string,
  campaign_id: string,
  data: Record<string, unknown>,
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

    if (data['name'] !== undefined) add('name', data['name']);
    if (data['budget'] !== undefined) add('budget', data['budget'] ? Number(data['budget']) : null);
    if (data['started_at'] !== undefined) add('started_at', data['started_at']);
    if (data['ended_at'] !== undefined) add('ended_at', data['ended_at']);

    if (data['platform_name'] !== undefined) {
      const platform_id = await resolveLookupId(tx, 'marketing_platforms', String(data['platform_name']));
      add('platform_id', platform_id);
    }
    if (data['status_name'] !== undefined) {
      const status_id = await resolveLookupId(tx, 'campaign_statuses', String(data['status_name']));
      add('status_id', status_id);
    }

    if (sets.length === 0) return null;

    params.push(campaign_id, org_id);
    const rows = await tx.unsafe(
      `UPDATE ad_campaigns SET ${sets.join(', ')}
       WHERE id = $${params.length - 1} AND org_id = $${params.length} AND NOT is_deleted
       RETURNING id`,
      params as unknown as SqlParams,
    );
    return (rows as unknown as Array<{ id: string }>)[0] ?? null;
  });
}

export async function deleteCampaign(
  org_id: string,
  user_id: string,
  campaign_id: string,
  role = 'org_admin',
  tenant_id = '',
) {
  const ctx: RoleTxContext = { role, org_id, tenant_id, user_id };
  return withRoleTx(ctx, async (tx) => {
    await tx.unsafe(
      `UPDATE ad_campaigns
       SET is_deleted = TRUE, deleted_at = CLOCK_TIMESTAMP(), deleted_by = $1::uuid
       WHERE id = $2 AND org_id = $3`,
      [user_id, campaign_id, org_id],
    );
  });
}
