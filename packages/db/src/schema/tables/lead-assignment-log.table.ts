import { uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { crmSchema } from '../pg-schemas';

export const leadAssignmentLogTable = crmSchema.table('lead_assignment_log', {
  id:                 uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  orgId:              uuid('org_id').notNull(),
  leadId:             uuid('lead_id').notNull(),
  assignedById:       uuid('assigned_by_id'),
  assignedToId:       uuid('assigned_to_id'),
  previousAssigneeId: uuid('previous_assignee_id'),
  action:             text('action').notNull().default('reassigned'),
  note:               text('note'),
  assignedAt:         timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
});
