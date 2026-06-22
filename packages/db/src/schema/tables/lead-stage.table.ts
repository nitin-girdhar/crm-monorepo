import { uuid, text, integer, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { crmSchema } from '../pg-schemas';

export const leadStageTable = crmSchema.table('lead_stage', {
  id:               uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  name:             text('name').notNull().unique(),
  label:            text('label').notNull(),
  description:      text('description'),
  sortOrder:        integer('sort_order').notNull().default(0),
  followupRequired: boolean('followup_required').notNull().default(false),
  isRejected:       boolean('is_rejected').notNull().default(false),
  isTerminated:     boolean('is_terminated').notNull().default(false),
});
