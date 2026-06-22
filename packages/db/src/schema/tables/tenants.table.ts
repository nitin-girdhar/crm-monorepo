import { uuid, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { entitySchema } from '../pg-schemas';
import { tenantDomainsTable } from './tenant-domains.table';
import { tenantPlanTypesTable } from './tenant-plan-types.table';

export const tenantsTable = entitySchema.table('tenants', {
  id:         uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  name:       text('name').notNull().unique(),
  domainId:   uuid('domain_id').references(() => tenantDomainsTable.id),
  planTypeId: uuid('plan_type_id').references(() => tenantPlanTypesTable.id),
  isActive:   boolean('is_active').notNull().default(true),
  isDeleted:  boolean('is_deleted').notNull().default(false),
  deletedAt:  timestamp('deleted_at', { withTimezone: true }),
  deletedBy:  uuid('deleted_by'),
  metadata:   jsonb('metadata').notNull().default({}),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
