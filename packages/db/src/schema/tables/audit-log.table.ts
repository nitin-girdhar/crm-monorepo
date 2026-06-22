import { uuid, text, char, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { auditSchema } from '../pg-schemas';

export const auditLogTable = auditSchema.table('audit_log', {
  id:            uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  tableName:     text('table_name').notNull(),
  operation:     char('operation', { length: 1 }).notNull(),
  recordId:      uuid('record_id'),
  changedBy:     uuid('changed_by'),
  changedFields: jsonb('changed_fields'),
  oldData:       jsonb('old_data'),
  newData:       jsonb('new_data'),
  orgId:         uuid('org_id'),
  changedAt:     timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});
