import { uuid, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { crmSchema } from '../pg-schemas';

export const leadSourcesTable = crmSchema.table('lead_sources', {
  id:   uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  name: text('name').notNull(),
});
