import { uuid, text, integer, numeric, jsonb } from 'drizzle-orm/pg-core';
import { marketingSchema } from '../pg-schemas';

export const vwTenantCampaignSummary = marketingSchema.view('vw_tenant_campaign_summary', {
  tenantId:         uuid('tenant_id').notNull(),
  orgId:            uuid('org_id').notNull(),
  orgName:          text('org_name').notNull(),
  campaignId:       uuid('campaign_id').notNull(),
  campaignName:     text('campaign_name').notNull(),
  platform:         text('platform').notNull(),
  campaignStatus:   text('campaign_status').notNull(),
  budget:           numeric('budget', { precision: 12, scale: 2 }),
  totalLeads:       integer('total_leads').notNull(),
  leadsByStage:     jsonb('leads_by_stage').notNull(),
  conversionRate:   numeric('conversion_rate', { precision: 5, scale: 2 }).notNull(),
}).existing();
