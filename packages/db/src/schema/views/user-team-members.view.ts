import { uuid, text, boolean, integer } from 'drizzle-orm/pg-core';
import { iamSchema } from '../pg-schemas';

export const vwUserTeamMembers = iamSchema.view('vw_user_team_members', {
  managerId:        uuid('manager_id').notNull(),
  orgId:            uuid('org_id').notNull(),
  memberId:         uuid('member_id').notNull(),
  memberFullName:   text('member_full_name'),
  memberEmail:      text('member_email'),
  memberRole:       text('member_role'),
  directManagerId:  uuid('direct_manager_id'),
  depth:            integer('depth').notNull(),
  isActive:         boolean('is_active'),
}).existing();
