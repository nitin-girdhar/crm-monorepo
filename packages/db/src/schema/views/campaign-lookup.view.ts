import { uuid, text, timestamp, numeric } from 'drizzle-orm/pg-core';
import { marketingSchema } from '../pg-schemas';

export const vwCampaignLookup = marketingSchema.view('vw_campaign_lookup', {
  campaignId:   uuid('campaign_id').notNull(),
  campaignName: text('campaign_name').notNull(),
  orgId:        uuid('org_id').notNull(),
  orgName:      text('org_name').notNull(),
  platformName: text('platform_name').notNull(),
  platformId:   uuid('platform_id').notNull(),
  statusName:   text('status_name').notNull(),
  statusId:     uuid('status_id').notNull(),
  budget:       numeric('budget', { precision: 12, scale: 2 }),
  startedAt:    timestamp('started_at', { withTimezone: true }),
  endedAt:      timestamp('ended_at', { withTimezone: true }),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull(),
}).existing();
