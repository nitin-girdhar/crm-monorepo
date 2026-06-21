import { uuid, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { crmSchema } from '../pg-schemas';

export const leadInteractionsTable = crmSchema.table('lead_interactions', {
  id:                uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  orgId:             uuid('org_id').notNull(),
  leadId:            uuid('lead_id').notNull(),
  userId:            uuid('user_id').notNull(),
  interactionTypeId: uuid('interaction_type_id'),
  notes:             text('notes'),
  durationSeconds:   integer('duration_seconds'),
  occurredAt:        timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  isDeleted:         boolean('is_deleted').notNull().default(false),
  deletedAt:         timestamp('deleted_at', { withTimezone: true }),
  deletedBy:         uuid('deleted_by'),
  createdBy:         uuid('created_by'),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
