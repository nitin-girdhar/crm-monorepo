import { uuid, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { crmSchema } from '../pg-schemas';
import { organizationsTable } from './organizations.table';
import { marketingLeadsTable } from './marketing-leads.table';
import { usersTable } from './users.table';
import { interactionTypesTable } from './interaction-types.table';

export const leadInteractionsTable = crmSchema.table('lead_interactions', {
  id:                uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  orgId:             uuid('org_id').notNull().references(() => organizationsTable.id, { onDelete: 'restrict' }),
  leadId:            uuid('lead_id').notNull().references(() => marketingLeadsTable.id, { onDelete: 'cascade' }),
  userId:            uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'restrict' }),
  interactionTypeId: uuid('interaction_type_id').references(() => interactionTypesTable.id, { onDelete: 'restrict' }),
  notes:             text('notes'),
  durationSeconds:   integer('duration_seconds'),
  occurredAt:        timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  isDeleted:         boolean('is_deleted').notNull().default(false),
  deletedAt:         timestamp('deleted_at', { withTimezone: true }),
  deletedBy:         uuid('deleted_by'),
  createdBy:         uuid('created_by'),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
