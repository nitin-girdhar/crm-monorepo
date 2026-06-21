import { uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { auditSchema } from '../pg-schemas';

export const activitiesTable = auditSchema.table('activities', {
  id:          uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  actionType:  text('action_type').notNull(),
  performedBy: uuid('performed_by'),
  targetId:    uuid('target_id'),
  targetType:  text('target_type'),
  orgId:       uuid('org_id'),
  meta:        jsonb('meta'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
