import { text, timestamp } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';

export const schemaVersionsTable = pgTable('schema_versions', {
  version:     text('version').primaryKey(),
  description: text('description'),
  appliedAt:   timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});
