import { sql, eq, and } from 'drizzle-orm';
import { withRoleTx } from '@crm/db';
import type { RoleTxContext } from '@crm/db';
import { leadFollowUpsTable, followUpStatusesTable } from '@crm/db/schema';
import { BadRequestError } from '../../../lib/errors.js';

export async function createFollowUp(
  ctx: RoleTxContext,
  leadId: string,
  data: { assigned_user_id?: string; scheduled_at: string; notes?: string },
) {
  return withRoleTx(ctx, async (tx) => {
    const [pendingStatus] = await tx
      .select({ id: followUpStatusesTable.id })
      .from(followUpStatusesTable)
      .where(eq(followUpStatusesTable.name, 'pending'))
      .limit(1);
    if (!pendingStatus) throw new BadRequestError('Follow-up status "pending" not found');

    const [inserted] = await tx
      .insert(leadFollowUpsTable)
      .values({
        orgId: ctx.org_id,
        leadId,
        assignedUserId: data.assigned_user_id ?? ctx.user_id,
        statusId: pendingStatus.id,
        scheduledAt: new Date(data.scheduled_at),
        notes: data.notes ?? null,
        createdBy: ctx.user_id,
      })
      .returning({ id: leadFollowUpsTable.id });

    return inserted!;
  });
}

export async function updateFollowUp(
  ctx: RoleTxContext,
  followUpId: string,
  data: { status_name?: string; completed_at?: string; scheduled_at?: string; notes?: string },
) {
  return withRoleTx(ctx, async (tx) => {
    const updateData: Record<string, unknown> = {};

    if (data.completed_at !== undefined) updateData['completedAt'] = new Date(data.completed_at);
    if (data.scheduled_at !== undefined) updateData['scheduledAt'] = new Date(data.scheduled_at);
    if (data.notes !== undefined)        updateData['notes']       = data.notes;

    if (data.status_name !== undefined) {
      const [status] = await tx
        .select({ id: followUpStatusesTable.id })
        .from(followUpStatusesTable)
        .where(eq(followUpStatusesTable.name, data.status_name))
        .limit(1);
      if (!status) throw new BadRequestError(`Invalid follow-up status: ${data.status_name}`);
      updateData['statusId'] = status.id;
    }

    if (Object.keys(updateData).length === 0) return null;

    const [updated] = await tx
      .update(leadFollowUpsTable)
      .set(updateData as Record<string, unknown>)
      .where(and(
        eq(leadFollowUpsTable.id, followUpId),
        eq(leadFollowUpsTable.orgId, ctx.org_id),
        eq(leadFollowUpsTable.isDeleted, false),
      ))
      .returning({ id: leadFollowUpsTable.id });

    return updated ?? null;
  });
}

export async function deleteFollowUp(ctx: RoleTxContext, followUpId: string) {
  return withRoleTx(ctx, async (tx) => {
    await tx.execute(sql`
      UPDATE crm.lead_follow_ups
      SET is_deleted = TRUE, deleted_at = CLOCK_TIMESTAMP(), deleted_by = ${ctx.user_id}::uuid
      WHERE id = ${followUpId} AND org_id = ${ctx.org_id}
    `);
  });
}
