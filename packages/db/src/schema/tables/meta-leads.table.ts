import { uuid, text, bigint, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { extSchema } from '../pg-schemas';
import { organizationsTable } from './organizations.table';
import { marketingLeadsTable } from './marketing-leads.table';

export const metaLeadsTable = extSchema.table('meta_leads', {
  id:               uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  orgId:            uuid('org_id').notNull().references(() => organizationsTable.id),
  marketingLeadId:  uuid('marketing_lead_id').references(() => marketingLeadsTable.id, { onDelete: 'set null' }),
  metaLeadId:       bigint('meta_lead_id', { mode: 'bigint' }).notNull().unique(),
  formId:           bigint('form_id', { mode: 'bigint' }).notNull(),
  campaignId:       bigint('campaign_id', { mode: 'bigint' }),
  adsetId:          bigint('adset_id', { mode: 'bigint' }),
  adId:             bigint('ad_id', { mode: 'bigint' }),
  platform:         text('platform'),
  leadCreatedAt:    timestamp('lead_created_at', { withTimezone: true }).notNull(),
  fullName:         text('full_name'),
  firstName:        text('first_name'),
  lastName:         text('last_name'),
  email:            text('email'),
  phone:            text('phone'),
  whatsappNumber:   text('whatsapp_number'),
  rawFieldData:     jsonb('raw_field_data'),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
