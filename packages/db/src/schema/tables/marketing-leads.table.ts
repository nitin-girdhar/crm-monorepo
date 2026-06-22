import { uuid, text, boolean, timestamp, jsonb, integer, smallint } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { crmSchema } from '../pg-schemas';
import { organizationsTable } from './organizations.table';
import { citiesTable } from './cities.table';
import { statesTable } from './states.table';
import { countriesTable } from './countries.table';
import { leadStageTable } from './lead-stage.table';
import { leadStageOutcomeTable } from './lead-stage-outcome.table';
import { adCampaignsTable } from './ad-campaigns.table';
import { leadSourcesTable } from './lead-sources.table';
import { branchesTable } from './branches.table';
import { usersTable } from './users.table';

export const marketingLeadsTable = crmSchema.table('marketing_leads', {
  id:              uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  orgId:           uuid('org_id').notNull().references(() => organizationsTable.id, { onDelete: 'restrict' }),
  firstName:       text('first_name').notNull(),
  middleName:      text('middle_name'),
  lastName:        text('last_name').notNull().default(''),
  fullName:        text('full_name').generatedAlwaysAs(
    sql`TRIM(first_name || COALESCE(' ' || NULLIF(middle_name, ''), '') || COALESCE(' ' || NULLIF(last_name, ''), ''))`,
  ),
  phone:           text('phone'),
  email:           text('email'),
  addressLine1:    text('address_line1'),
  addressLine2:    text('address_line2'),
  landmark:        text('landmark'),
  pincode:         text('pincode'),
  city:            text('city'),
  cityId:          integer('city_id').references(() => citiesTable.id, { onDelete: 'restrict' }),
  stateId:         smallint('state_id').references(() => statesTable.id, { onDelete: 'restrict' }),
  countryId:       smallint('country_id').references(() => countriesTable.id, { onDelete: 'restrict' }),
  stageId:         uuid('stage_id').references(() => leadStageTable.id, { onDelete: 'restrict' }),
  outcomeId:       uuid('outcome_id').references(() => leadStageOutcomeTable.id, { onDelete: 'restrict' }),
  outcomeComment:  text('outcome_comment'),
  campaignId:      uuid('campaign_id').references(() => adCampaignsTable.id, { onDelete: 'set null' }),
  sourceId:        uuid('source_id').references(() => leadSourcesTable.id),
  branchId:        uuid('branch_id').references(() => branchesTable.id),
  assignedUserId:  uuid('assigned_user_id').references(() => usersTable.id, { onDelete: 'set null' }),
  duplicateLeadId: uuid('duplicate_lead_id').references((): any => marketingLeadsTable.id, { onDelete: 'set null' }),
  rawWebhookData:  jsonb('raw_webhook_data').notNull().default({}),
  metadata:        jsonb('metadata').notNull().default({}),
  tags:            text('tags').array().notNull().default(sql`'{}'`),
  isDeleted:       boolean('is_deleted').notNull().default(false),
  deletedAt:       timestamp('deleted_at', { withTimezone: true }),
  deletedBy:       uuid('deleted_by'),
  createdBy:       uuid('created_by'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
