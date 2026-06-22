import { uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { iamSchema } from '../pg-schemas';
import { usersTable } from './users.table';
import { organizationsTable } from './organizations.table';

export const tokenBlocklistTable = iamSchema.table('token_blocklist', {
  id:        uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  jti:       text('jti'),
  userId:    uuid('user_id').references(() => usersTable.id, { onDelete: 'cascade' }),
  orgId:     uuid('org_id').references(() => organizationsTable.id, { onDelete: 'cascade' }),
  tenantId:  uuid('tenant_id'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }).notNull().defaultNow(),
  revokedBy: uuid('revoked_by').references(() => usersTable.id, { onDelete: 'set null' }),
  reason:    text('reason'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
