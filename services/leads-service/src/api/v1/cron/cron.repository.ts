import { eq } from 'drizzle-orm';
import { withServiceTx } from '@crm/db';
import { followUpStatusesTable, leadFollowUpsTable } from '@crm/db/schema';
import { sql } from 'drizzle-orm';

export async function markMissedFollowUps(): Promise<number> {
  return withServiceTx(async (tx) => {
    const [[missedStatus], [pendingStatus]] = await Promise.all([
      tx.select({ id: followUpStatusesTable.id }).from(followUpStatusesTable).where(eq(followUpStatusesTable.name, 'missed')).limit(1),
      tx.select({ id: followUpStatusesTable.id }).from(followUpStatusesTable).where(eq(followUpStatusesTable.name, 'pending')).limit(1),
    ]);

    if (!missedStatus) throw new Error('crm.follow_up_statuses: missed not found');
    if (!pendingStatus) throw new Error('crm.follow_up_statuses: pending not found');

    const rows = (await tx.execute(sql`
      UPDATE crm.lead_follow_ups
      SET status_id = ${missedStatus.id}, updated_at = CLOCK_TIMESTAMP()
      WHERE status_id = ${pendingStatus.id}
        AND scheduled_at < CLOCK_TIMESTAMP()
        AND NOT is_deleted
      RETURNING id
    `)) as Array<{ id: string }>;

    return rows.length;
  });
}
