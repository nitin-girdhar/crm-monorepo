import { uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { crmSchema } from '../pg-schemas';
import { marketingLeadsTable } from './marketing-leads.table';
import { organizationsTable } from './organizations.table';
import { usersTable } from './users.table';

export const leadLinksTable = crmSchema.table('lead_links', {
  id:           uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  sourceLeadId: uuid('source_lead_id').notNull().references(() => marketingLeadsTable.id, { onDelete: 'restrict' }),
  sourceOrgId:  uuid('source_org_id').notNull().references(() => organizationsTable.id, { onDelete: 'restrict' }),
  destLeadId:   uuid('dest_lead_id').references(() => marketingLeadsTable.id, { onDelete: 'set null' }),
  destOrgId:    uuid('dest_org_id').notNull().references(() => organizationsTable.id, { onDelete: 'restrict' }),
  linkType:     text('link_type').notNull(),   // 'merge' | 'transfer'
  createdBy:    uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
  reason:       text('reason'),
  notes:        text('notes'),
  status:       text('status').notNull().default('completed'),  // 'pending' | 'completed' | 'rejected'
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
