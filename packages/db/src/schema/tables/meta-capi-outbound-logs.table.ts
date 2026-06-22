import { uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { extSchema } from '../pg-schemas';
import { organizationsTable } from './organizations.table';
import { marketingLeadsTable } from './marketing-leads.table';
import { metaLeadsTable } from './meta-leads.table';

export const metaCapiOutboundLogsTable = extSchema.table('meta_capi_outbound_logs', {
  id:                uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  orgId:             uuid('org_id').notNull().references(() => organizationsTable.id),
  marketingLeadId:   uuid('marketing_lead_id').notNull().references(() => marketingLeadsTable.id),
  metaLeadId:        uuid('meta_lead_id').references(() => metaLeadsTable.id, { onDelete: 'set null' }),
  eventName:         text('event_name').notNull(),
  eventId:           text('event_id').notNull(),
  deliveryStatus:    text('delivery_status').notNull(),
  fbTraceId:         text('fb_trace_id'),
  requestPayload:    jsonb('request_payload').notNull(),
  responsePayload:   jsonb('response_payload'),
  triggeredBy:       text('triggered_by').notNull(),
  triggeredByUserId: uuid('triggered_by_user_id'),
  sentAt:            timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});
