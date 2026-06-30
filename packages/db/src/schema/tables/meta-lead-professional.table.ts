import { uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { extSchema } from '../pg-schemas';
import { organizationsTable } from './organizations.table';
import { metaLeadsTable } from './meta-leads.table';

export const metaLeadProfessionalTable = extSchema.table('meta_lead_professional', {
  metaLeadId:      uuid('meta_lead_id').primaryKey().references(() => metaLeadsTable.id, { onDelete: 'cascade' }),
  orgId:           uuid('org_id').notNull().references(() => organizationsTable.id),
  jobTitle:        text('job_title'),
  companyName:     text('company_name'),
  workEmail:       text('work_email'),
  workPhoneNumber: text('work_phone_number'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
