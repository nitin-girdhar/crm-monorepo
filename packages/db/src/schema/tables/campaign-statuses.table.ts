import { uuid, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { marketingSchema } from '../pg-schemas';

export const campaignStatusesTable = marketingSchema.table('campaign_statuses', {
  id:          uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  name:        text('name').notNull(),
  description: text('description'),
});
