import { uuid, text, integer, boolean, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { crmSchema } from '../pg-schemas';
import { leadStageTable } from './lead-stage.table';

export const leadStageOutcomeTable = crmSchema.table('lead_stage_outcome', {
  id:              uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  stageId:         uuid('stage_id').notNull().references(() => leadStageTable.id, { onDelete: 'restrict' }),
  name:            text('name').notNull(),
  label:           text('label').notNull(),
  description:     text('description'),
  requiresComment: boolean('requires_comment').notNull().default(false),
  sortOrder:       integer('sort_order').notNull().default(0),
}, (t) => ({
  uqLeadStageOutcomeStageName: unique('uq_lead_stage_outcome_stage_name').on(t.stageId, t.name),
}));
