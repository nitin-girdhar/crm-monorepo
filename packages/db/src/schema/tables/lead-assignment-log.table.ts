import { uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { crmSchema } from '../pg-schemas';
import { organizationsTable } from './organizations.table';
import { marketingLeadsTable } from './marketing-leads.table';
import { usersTable } from './users.table';

export const leadAssignmentLogTable = crmSchema.table('lead_assignment_log', {
  id:                 uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  orgId:              uuid('org_id').notNull().references(() => organizationsTable.id, { onDelete: 'restrict' }),
  leadId:             uuid('lead_id').notNull().references(() => marketingLeadsTable.id, { onDelete: 'cascade' }),
  assignedById:       uuid('assigned_by_id').references(() => usersTable.id, { onDelete: 'set null' }),
  assignedToId:       uuid('assigned_to_id').references(() => usersTable.id, { onDelete: 'set null' }),
  previousAssigneeId: uuid('previous_assignee_id').references(() => usersTable.id, { onDelete: 'set null' }),
  action:             text('action').notNull().default('reassigned'),
  note:               text('note'),
  assignedAt:         timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
});
