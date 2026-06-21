import { uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { crmSchema } from '../pg-schemas';

export const vwLeadFollowupTimeline = crmSchema.view('vw_lead_followup_timeline', {
  eventId:          uuid('event_id').notNull(),
  orgId:            uuid('org_id').notNull(),
  leadId:           uuid('lead_id').notNull(),
  eventType:        text('event_type').notNull(),
  eventAt:          timestamp('event_at', { withTimezone: true }).notNull(),
  actorName:        text('actor_name'),
  actorEmail:       text('actor_email'),
  oldStage:         text('old_stage'),
  oldStageLabel:    text('old_stage_label'),
  newStage:         text('new_stage'),
  newStageLabel:    text('new_stage_label'),
  oldOutcome:       text('old_outcome'),
  oldOutcomeLabel:  text('old_outcome_label'),
  newOutcome:       text('new_outcome'),
  newOutcomeLabel:  text('new_outcome_label'),
  assignedToName:   text('assigned_to_name'),
  note:             text('note'),
  followupId:       uuid('followup_id'),
  followupStatus:   text('followup_status'),
  scheduledAt:      timestamp('scheduled_at', { withTimezone: true }),
  completedAt:      timestamp('completed_at', { withTimezone: true }),
  interactionType:  text('interaction_type'),
}).existing();
