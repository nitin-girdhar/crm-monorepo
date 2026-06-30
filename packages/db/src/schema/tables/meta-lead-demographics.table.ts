import { uuid, text, date, timestamp } from 'drizzle-orm/pg-core';
import { extSchema } from '../pg-schemas';
import { organizationsTable } from './organizations.table';
import { metaLeadsTable } from './meta-leads.table';

export const metaLeadDemographicsTable = extSchema.table('meta_lead_demographics', {
  metaLeadId:         uuid('meta_lead_id').primaryKey().references(() => metaLeadsTable.id, { onDelete: 'cascade' }),
  orgId:              uuid('org_id').notNull().references(() => organizationsTable.id),
  dateOfBirth:        date('date_of_birth'),
  gender:             text('gender'),
  maritalStatus:      text('marital_status'),
  relationshipStatus: text('relationship_status'),
  militaryStatus:     text('military_status'),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
