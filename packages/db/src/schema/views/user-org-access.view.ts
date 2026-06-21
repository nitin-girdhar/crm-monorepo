import { uuid, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';
import { iamSchema } from '../pg-schemas';

export const vwUserOrgAccess = iamSchema.view('vw_user_org_access', {
  userId:           uuid('user_id').notNull(),
  userFullName:     text('user_full_name'),
  userEmail:        text('user_email'),
  userIsActive:     boolean('user_is_active'),
  orgId:            uuid('org_id').notNull(),
  orgName:          text('org_name'),
  tenantId:         uuid('tenant_id'),
  tenantName:       text('tenant_name'),
  roleName:         text('role_name').notNull(),
  roleLabel:        text('role_label').notNull(),
  roleRank:         integer('role_rank').notNull(),
  grantedAt:        timestamp('granted_at', { withTimezone: true }).notNull(),
  mappingUpdatedAt: timestamp('mapping_updated_at', { withTimezone: true }),
}).existing();
