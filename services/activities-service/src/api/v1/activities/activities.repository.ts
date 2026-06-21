import { sql } from 'drizzle-orm';
import { withServiceTx } from '@crm/db';
import { activitiesTable } from '@crm/db/schema';

export interface InsertActivityInput {
  action_type: string;
  performed_by: string;
  subject_user_id?: string | null;
  lead_id?: string | null;
  old_value?: unknown;
  new_value?: unknown;
}

export async function insertActivity(input: InsertActivityInput): Promise<void> {
  const meta: Record<string, unknown> = {};
  if (input.subject_user_id) meta['subject_user_id'] = input.subject_user_id;
  if (input.lead_id) meta['lead_id'] = input.lead_id;
  if (input.old_value !== undefined) meta['old_value'] = input.old_value;
  if (input.new_value !== undefined) meta['new_value'] = input.new_value;

  const targetId = input.lead_id ?? input.subject_user_id ?? null;
  const targetType = input.lead_id ? 'lead' : input.subject_user_id ? 'user' : null;

  await withServiceTx(async (tx) => {
    await tx.execute(sql`
      INSERT INTO audit.activities (action_type, performed_by, target_id, target_type, meta)
      VALUES (
        ${input.action_type},
        ${input.performed_by ? sql`${input.performed_by}::uuid` : sql`NULL`},
        ${targetId},
        ${targetType},
        ${JSON.stringify(meta)}::jsonb
      )
    `);
  });
}

export async function listActivities() {
  return withServiceTx(async (tx) => {
    return (await tx.execute(sql`
      SELECT id, action_type, performed_by, target_id, target_type, meta, created_at
      FROM audit.activities
      ORDER BY created_at DESC
      LIMIT 100
    `)) as Array<Record<string, unknown>>;
  });
}
