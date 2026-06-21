import { withRoleTx } from '@crm/db';
import type { SqlParams, RoleTxContext } from '@crm/db';
import type { CreateLeadInput, UpdateLeadInput } from '@crm/validation';

function coerceTags(val: unknown): string[] | null {
  if (val === undefined || val === null) return null;
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') return val.split(',').map((t) => t.trim()).filter(Boolean);
  return null;
}

export async function createLead(
  org_id: string,
  user_id: string,
  data: CreateLeadInput,
  role = 'org_admin',
  tenant_id = '',
) {
  const ctx: RoleTxContext = { role, org_id, tenant_id, user_id };
  return withRoleTx(ctx, async (tx) => {
    const stage_rows = await tx.unsafe(
      `SELECT id FROM crm.lead_stage WHERE name = 'new' LIMIT 1`,
    );
    const stage_row = (stage_rows as unknown as Array<{ id: string }>)[0];
    if (!stage_row) throw new Error('Lead stage "new" not found');

    let duplicate_lead_id: string | null = null;

    if (data.phone) {
      const existing = await tx.unsafe(
        `SELECT id FROM crm.marketing_leads
         WHERE org_id = $1 AND phone = $2 AND NOT is_deleted
         ORDER BY created_at ASC LIMIT 1`,
        [org_id, data.phone],
      );
      const row = (existing as unknown as Array<{ id: string }>)[0];
      if (row) duplicate_lead_id = row.id;
    }

    if (data.email && !duplicate_lead_id) {
      const existing = await tx.unsafe(
        `SELECT id FROM crm.marketing_leads
         WHERE org_id = $1 AND email = $2 AND NOT is_deleted
         ORDER BY created_at ASC LIMIT 1`,
        [org_id, data.email],
      );
      const row = (existing as unknown as Array<{ id: string }>)[0];
      if (row) duplicate_lead_id = row.id;
    }

    const tags = coerceTags(data.tags);

    const rows = await tx.unsafe(
      `INSERT INTO crm.marketing_leads
         (org_id, first_name, middle_name, last_name, phone, email, city,
          address_line1, address_line2, pincode,
          branch_id, source_id, campaign_id, stage_id, assigned_user_id, duplicate_lead_id,
          city_id, state_id, country_id,
          raw_webhook_data, metadata, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING id`,
      [
        org_id,
        data.first_name,
        data.middle_name ?? null,
        data.last_name ?? null,
        data.phone ?? null,
        data.email ?? null,
        data.city ?? null,
        data.address_line1 ?? null,
        data.address_line2 ?? null,
        data.pincode ?? null,
        data.branch_id ?? null,
        data.source_id ?? null,
        data.campaign_id ?? null,
        data.stage_id ?? stage_row.id,
        data.assigned_user_id ?? null,
        duplicate_lead_id,
        data.city_id ?? null,
        data.state_id ?? null,
        data.country_id ?? null,
        data.raw_webhook_data ? JSON.stringify(data.raw_webhook_data) : '{}',
        data.metadata ? JSON.stringify(data.metadata) : '{}',
        tags,
      ],
    );
    return (rows as unknown as Array<{ id: string }>)[0]!;
  });
}

export async function updateLead(
  org_id: string,
  user_id: string,
  lead_id: string,
  data: UpdateLeadInput,
  role = 'org_admin',
  tenant_id = '',
) {
  const ctx: RoleTxContext = { role, org_id, tenant_id, user_id };
  return withRoleTx(ctx, async (tx) => {
    if (data.assigned_user_id !== undefined && data.assigned_user_id !== null) {
      const rows = await tx.unsafe(
        `SELECT iam.can_assign_to($1::uuid, $2::uuid, $3::uuid) AS allowed`,
        [org_id, user_id, data.assigned_user_id],
      );
      const allowed = (rows as unknown as Array<{ allowed: boolean }>)[0];
      if (!allowed?.allowed) {
        throw new Error('Insufficient hierarchy authority to assign this lead');
      }
    }

    if (data.transition_note) {
      await tx.unsafe(
        `SELECT set_config('app.lead_transition_note', $1, true)`,
        [data.transition_note],
      );
    }

    const sets: string[] = [];
    const params: unknown[] = [];

    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (data.stage_id !== undefined) add('stage_id', data.stage_id);
    if (data.outcome_id !== undefined) add('outcome_id', data.outcome_id);
    if (data.outcome_comment !== undefined) add('outcome_comment', data.outcome_comment);
    if (data.assigned_user_id !== undefined) add('assigned_user_id', data.assigned_user_id);
    if (data.first_name !== undefined) add('first_name', data.first_name);
    if (data.middle_name !== undefined) add('middle_name', data.middle_name);
    if (data.last_name !== undefined) add('last_name', data.last_name);
    if (data.phone !== undefined) add('phone', data.phone);
    if (data.email !== undefined) add('email', data.email);
    if (data.city !== undefined) add('city', data.city);
    if (data.city_id !== undefined) add('city_id', data.city_id);
    if (data.state_id !== undefined) add('state_id', data.state_id);
    if (data.country_id !== undefined) add('country_id', data.country_id);
    if (data.address_line1 !== undefined) add('address_line1', data.address_line1);
    if (data.address_line2 !== undefined) add('address_line2', data.address_line2);
    if (data.pincode !== undefined) add('pincode', data.pincode);
    if (data.branch_id !== undefined) add('branch_id', data.branch_id);
    if (data.source_id !== undefined) add('source_id', data.source_id);
    if (data.tags !== undefined) add('tags', coerceTags(data.tags));
    if (data.metadata !== undefined) add('metadata', JSON.stringify(data.metadata));

    if (sets.length === 0) return null;

    params.push(lead_id, org_id);
    const update_rows = await tx.unsafe(
      `UPDATE crm.marketing_leads
       SET ${sets.join(', ')}
       WHERE id = $${params.length - 1} AND org_id = $${params.length} AND NOT is_deleted
       RETURNING id`,
      params as unknown as SqlParams,
    );
    const result = (update_rows as unknown as Array<{ id: string }>)[0];
    if (!result) return null;

    if (data.note && data.note.trim()) {
      await tx.unsafe(
        `INSERT INTO crm.lead_interactions (org_id, lead_id, user_id, notes)
         VALUES ($1, $2, $3, $4)`,
        [org_id, lead_id, user_id, data.note.trim()],
      );
    }

    return result;
  });
}

export async function deleteLead(
  org_id: string,
  user_id: string,
  lead_id: string,
  role = 'org_admin',
  tenant_id = '',
) {
  const ctx: RoleTxContext = { role, org_id, tenant_id, user_id };
  return withRoleTx(ctx, async (tx) => {
    await tx.unsafe(
      `UPDATE crm.marketing_leads
       SET is_deleted = TRUE, deleted_at = CLOCK_TIMESTAMP(), deleted_by = $1::uuid
       WHERE id = $2 AND org_id = $3`,
      [user_id, lead_id, org_id],
    );
  });
}

export async function createInteraction(
  org_id: string,
  user_id: string,
  lead_id: string,
  data: { interaction_type_name?: string | undefined; notes?: string | undefined; occurred_at?: string | undefined },
  role = 'org_admin',
  tenant_id = '',
) {
  const ctx: RoleTxContext = { role, org_id, tenant_id, user_id };
  return withRoleTx(ctx, async (tx) => {
    let interaction_type_id: string | null = null;
    if (data.interaction_type_name) {
      const type_rows = await tx.unsafe(
        `SELECT id FROM crm.interaction_types WHERE name = $1 LIMIT 1`,
        [data.interaction_type_name],
      );
      interaction_type_id = (type_rows as unknown as Array<{ id: string }>)[0]?.id ?? null;
    }

    const rows = await tx.unsafe(
      `INSERT INTO crm.lead_interactions (org_id, lead_id, user_id, interaction_type_id, notes, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        org_id,
        lead_id,
        user_id,
        interaction_type_id,
        data.notes ?? null,
        data.occurred_at ? new Date(data.occurred_at) : new Date(),
      ] as unknown as SqlParams,
    );
    return (rows as unknown as Array<{ id: string }>)[0]!;
  });
}
