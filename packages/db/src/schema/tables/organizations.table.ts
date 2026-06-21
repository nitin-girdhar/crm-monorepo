import { uuid, text, boolean, integer, smallint, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { entitySchema } from '../pg-schemas';

export const organizationsTable = entitySchema.table('organizations', {
  id:              uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  tenantId:        uuid('tenant_id').notNull(),
  name:            text('name').notNull(),
  legalEntityName: text('legal_entity_name'),
  brandName:       text('brand_name'),
  orgTypeId:       uuid('org_type_id'),
  addressLine1:    text('address_line1'),
  addressLine2:    text('address_line2'),
  landmark:        text('landmark'),
  pincode:         text('pincode'),
  city:            text('city'),
  cityId:          integer('city_id'),
  stateId:         smallint('state_id'),
  countryId:       smallint('country_id'),
  timezone:        text('timezone').notNull().default('Asia/Kolkata'),
  isActive:        boolean('is_active').notNull().default(true),
  isDeleted:       boolean('is_deleted').notNull().default(false),
  deletedAt:       timestamp('deleted_at', { withTimezone: true }),
  deletedBy:       uuid('deleted_by'),
  metadata:        jsonb('metadata').notNull().default({}),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
