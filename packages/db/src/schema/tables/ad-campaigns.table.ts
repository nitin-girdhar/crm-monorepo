import { uuid, text, boolean, timestamp, numeric } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { marketingSchema } from '../pg-schemas';

export const adCampaignsTable = marketingSchema.table('ad_campaigns', {
  id:         uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  orgId:      uuid('org_id').notNull(),
  name:       text('name').notNull(),
  platformId: uuid('platform_id').notNull(),
  statusId:   uuid('status_id').notNull(),
  budget:     numeric('budget', { precision: 12, scale: 2 }),
  startedAt:  timestamp('started_at', { withTimezone: true }),
  endedAt:    timestamp('ended_at', { withTimezone: true }),
  isDeleted:  boolean('is_deleted').notNull().default(false),
  deletedAt:  timestamp('deleted_at', { withTimezone: true }),
  deletedBy:  uuid('deleted_by'),
  createdBy:  uuid('created_by'),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
