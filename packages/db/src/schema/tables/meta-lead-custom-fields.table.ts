import { uuid, text, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { extSchema } from '../pg-schemas';
import { metaLeadsTable } from './meta-leads.table';
import { organizationsTable } from './organizations.table';

export const metaLeadCustomFieldsTable = extSchema.table('meta_lead_custom_fields', {
  id:            uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  metaLeadId:    uuid('meta_lead_id').notNull().references(() => metaLeadsTable.id, { onDelete: 'cascade' }),
  orgId:         uuid('org_id').notNull().references(() => organizationsTable.id),
  questionKey:   text('question_key').notNull(),
  questionValue: text('question_value'),
}, (t) => ({
  uqMetaCustomField: unique('uq_meta_custom_field').on(t.metaLeadId, t.questionKey),
}));
