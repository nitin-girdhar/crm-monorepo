import { uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { extSchema } from '../pg-schemas';
import { organizationsTable } from './organizations.table';
import { metaLeadsTable } from './meta-leads.table';

export const metaLeadAddressesTable = extSchema.table('meta_lead_addresses', {
  metaLeadId:    uuid('meta_lead_id').primaryKey().references(() => metaLeadsTable.id, { onDelete: 'cascade' }),
  orgId:         uuid('org_id').notNull().references(() => organizationsTable.id),
  streetAddress: text('street_address'),
  city:          text('city'),
  state:         text('state'),
  province:      text('province'),
  country:       text('country'),
  postalCode:    text('postal_code'),
  zipCode:       text('zip_code'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
