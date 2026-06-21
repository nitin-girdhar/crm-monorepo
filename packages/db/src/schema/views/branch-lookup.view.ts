import { uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { entitySchema } from '../pg-schemas';

export const vwBranchLookup = entitySchema.view('vw_branch_lookup', {
  branchId:   uuid('branch_id').notNull(),
  branchName: text('branch_name').notNull(),
  isActive:   boolean('is_active').notNull(),
  orgId:      uuid('org_id').notNull(),
  orgName:    text('org_name').notNull(),
  tenantId:   uuid('tenant_id').notNull(),
  tenantName: text('tenant_name').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull(),
}).existing();
