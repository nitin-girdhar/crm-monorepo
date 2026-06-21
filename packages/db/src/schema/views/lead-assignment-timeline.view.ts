import { uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { crmSchema } from '../pg-schemas';

export const vwLeadAssignmentTimeline = crmSchema.view('vw_lead_assignment_timeline', {
  logId:                uuid('log_id').notNull(),
  orgId:                uuid('org_id').notNull(),
  leadId:               uuid('lead_id').notNull(),
  leadFullName:         text('lead_full_name'),
  assignedByName:       text('assigned_by_name'),
  assignedByEmail:      text('assigned_by_email'),
  assignedToName:       text('assigned_to_name'),
  assignedToEmail:      text('assigned_to_email'),
  previousAssigneeName: text('previous_assignee_name'),
  action:               text('action').notNull(),
  note:                 text('note'),
  assignedAt:           timestamp('assigned_at', { withTimezone: true }).notNull(),
  heldFor:              text('held_for'),
}).existing();
