import { withServiceTx } from '@crm/db';
import { fromPgError } from '@crm/db';

export async function assignLead(data: {
  lead_id: string;
  branch: string;
  assigned_to: string;
  assigned_by: string;
  notes: string | null;
}) {
  return withServiceTx(async (tx) => {
    const rows = await tx.unsafe(
      `UPDATE marketing_leads
       SET assigned_user_id = $1
       WHERE id = $2 AND assigned_user_id IS NULL AND NOT is_deleted
       RETURNING id, assigned_user_id, org_id, updated_at`,
      [data.assigned_to, data.lead_id],
    );
    const row = (rows as Array<Record<string, unknown>>)[0];
    if (!row) {
      throw Object.assign(new Error('Lead is already assigned'), { code: '23505' });
    }
    return row;
  });
}

export async function reassignLead(data: {
  lead_id: string;
  assigned_to: string;
  assigned_by: string;
  notes: string | null;
}) {
  return withServiceTx(async (tx) => {
    const before_rows = await tx.unsafe(
      `SELECT assigned_user_id FROM marketing_leads WHERE id = $1 AND NOT is_deleted`,
      [data.lead_id],
    );
    const before = (before_rows as unknown as Array<{ assigned_user_id: string | null }>)[0];

    const rows = await tx.unsafe(
      `UPDATE marketing_leads
       SET assigned_user_id = $1
       WHERE id = $2 AND NOT is_deleted
       RETURNING id, assigned_user_id, org_id, updated_at`,
      [data.assigned_to, data.lead_id],
    );
    const row = (rows as Array<Record<string, unknown>>)[0] ?? null;
    return { result: row, previous_assignee: before?.assigned_user_id ?? null };
  });
}

export async function unassignLead(lead_id: string) {
  return withServiceTx(async (tx) => {
    const rows = await tx.unsafe(
      `UPDATE marketing_leads
       SET assigned_user_id = NULL
       WHERE id = $1 AND NOT is_deleted
       RETURNING id`,
      [lead_id],
    );
    return (rows as Array<Record<string, unknown>>)[0] ?? null;
  });
}
