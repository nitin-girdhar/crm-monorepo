import { withServiceTx } from '@crm/db';
import type { InsertActivityInput } from '../types.js';

export async function insertActivity(input: InsertActivityInput): Promise<void> {
  const meta: Record<string, unknown> = {};
  if (input.subject_user_id) meta['subject_user_id'] = input.subject_user_id;
  if (input.lead_id) meta['lead_id'] = input.lead_id;
  if (input.old_value !== undefined) meta['old_value'] = input.old_value;
  if (input.new_value !== undefined) meta['new_value'] = input.new_value;

  await withServiceTx(async (tx) => {
    await tx.unsafe(
      `INSERT INTO audit.activities (action_type, performed_by, target_id, target_type, meta)
       VALUES ($1, $2::uuid, $3, $4, $5::jsonb)`,
      [
        input.action_type,
        input.performed_by || null,
        input.lead_id ?? input.subject_user_id ?? null,
        input.lead_id ? 'lead' : input.subject_user_id ? 'user' : null,
        JSON.stringify(meta),
      ],
    );
  });
}
