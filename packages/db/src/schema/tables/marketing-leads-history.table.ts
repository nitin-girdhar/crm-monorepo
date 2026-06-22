import { uuid, char, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { auditSchema } from '../pg-schemas';
import { marketingLeadsTable } from './marketing-leads.table';
import { usersTable } from './users.table';

export const marketingLeadsHistoryTable = auditSchema.table('marketing_leads_history', {
  id:                uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  leadId:            uuid('lead_id').notNull().references(() => marketingLeadsTable.id, { onDelete: 'restrict' }),
  changedByUserId:   uuid('changed_by_user_id').references(() => usersTable.id, { onDelete: 'set null' }),
  operation:         char('operation', { length: 1 }).notNull(),
  changedFields:     jsonb('changed_fields'),
  changedAt:         timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});
