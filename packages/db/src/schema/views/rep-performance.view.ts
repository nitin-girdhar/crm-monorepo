import { uuid, text, integer, numeric } from 'drizzle-orm/pg-core';
import { crmSchema } from '../pg-schemas';

export const vwRepPerformance = crmSchema.view('vw_rep_performance', {
  orgId:               uuid('org_id').notNull(),
  orgName:             text('org_name').notNull(),
  repId:               uuid('rep_id').notNull(),
  repName:             text('rep_name'),
  repEmail:            text('rep_email'),
  roleName:            text('role_name'),
  totalAssigned:       integer('total_assigned').notNull(),
  newCount:            integer('new_count').notNull(),
  contactingCount:     integer('contacting_count').notNull(),
  qualifiedCount:      integer('qualified_count').notNull(),
  convertedCount:      integer('converted_count').notNull(),
  unqualifiedCount:    integer('unqualified_count').notNull(),
  transferredOutCount: integer('transferred_out_count').notNull(),
  conversionRatePct:   numeric('conversion_rate_pct', { precision: 5, scale: 2 }).notNull(),
}).existing();
