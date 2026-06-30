import { uuid, boolean, timestamp, primaryKey, smallint } from 'drizzle-orm/pg-core';
import { iamSchema } from '../pg-schemas';
import { usersTable } from './users.table';
import { organizationsTable } from './organizations.table';
import { userRolesTable } from './user-roles.table';

export const userOrgMappingTable = iamSchema.table('user_org_mapping', {
  userId:    uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  orgId:     uuid('org_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  roleId:    uuid('role_id').notNull().references(() => userRolesTable.id, { onDelete: 'restrict' }),
  isActive:  boolean('is_active').notNull().default(true),
  leadAssignmentWeight: smallint('lead_assignment_weight').notNull().default(0),
  grantedBy: uuid('granted_by').references(() => usersTable.id, { onDelete: 'set null' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.orgId] }),
}));
