import { uuid, text, integer } from 'drizzle-orm/pg-core';
import { iamSchema } from '../pg-schemas';

export const vwUserOrgChart = iamSchema.view('vw_user_org_chart', {
  userId:         uuid('user_id').notNull(),
  orgId:          uuid('org_id').notNull(),
  firstName:      text('first_name').notNull(),
  middleName:     text('middle_name'),
  lastName:       text('last_name').notNull(),
  fullName:       text('full_name').notNull(),
  email:          text('email').notNull(),
  roleName:       text('role_name').notNull(),
  managerId:      uuid('manager_id'),
  managerFullName: text('manager_full_name'),
  hierarchyLevel: integer('hierarchy_level').notNull(),
  reportingPath:  text('reporting_path'),
  ancestorIds:    uuid('ancestor_ids').array(),
}).existing();
