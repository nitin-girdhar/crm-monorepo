import { uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { entitySchema } from '../pg-schemas';

export const branchesTable = entitySchema.table('branches', {
  id:        uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  orgId:     uuid('org_id').notNull(),
  name:      text('name').notNull(),
  isActive:  boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
