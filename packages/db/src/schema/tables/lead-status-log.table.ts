import { uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { crmSchema } from '../pg-schemas';
import { organizationsTable } from './organizations.table';
import { marketingLeadsTable } from './marketing-leads.table';
import { usersTable } from './users.table';
import { leadStageTable } from './lead-stage.table';
import { leadStageOutcomeTable } from './lead-stage-outcome.table';

export const leadStatusLogTable = crmSchema.table('lead_status_log', {
  id:             uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  orgId:          uuid('org_id').notNull().references(() => organizationsTable.id, { onDelete: 'restrict' }),
  leadId:         uuid('lead_id').notNull().references(() => marketingLeadsTable.id, { onDelete: 'cascade' }),
  changedById:    uuid('changed_by_id').references(() => usersTable.id, { onDelete: 'set null' }),
  oldStageId:     uuid('old_stage_id').references(() => leadStageTable.id, { onDelete: 'restrict' }),
  newStageId:     uuid('new_stage_id').notNull().references(() => leadStageTable.id, { onDelete: 'restrict' }),
  oldOutcomeId:   uuid('old_outcome_id').references(() => leadStageOutcomeTable.id, { onDelete: 'restrict' }),
  newOutcomeId:   uuid('new_outcome_id').references(() => leadStageOutcomeTable.id, { onDelete: 'restrict' }),
  assignedUserId: uuid('assigned_user_id').references(() => usersTable.id, { onDelete: 'set null' }),
  transitionNote: text('transition_note'),
  changedAt:      timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});
