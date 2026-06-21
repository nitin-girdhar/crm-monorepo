import { uuid, boolean, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { iamSchema } from '../pg-schemas';

export const userOrgMappingTable = iamSchema.table('user_org_mapping', {
  userId:    uuid('user_id').notNull(),
  orgId:     uuid('org_id').notNull(),
  roleId:    uuid('role_id').notNull(),
  isActive:  boolean('is_active').notNull().default(true),
  grantedBy: uuid('granted_by'),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.orgId] }),
}));
