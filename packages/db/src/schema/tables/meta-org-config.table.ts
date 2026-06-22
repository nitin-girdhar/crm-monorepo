import { uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { extSchema } from '../pg-schemas';
import { organizationsTable } from './organizations.table';

export const metaOrgConfigTable = extSchema.table('meta_org_config', {
  id:                uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  orgId:             uuid('org_id').notNull().references(() => organizationsTable.id).unique(),
  appSecret:         text('app_secret').notNull(),
  verifyToken:       text('verify_token').notNull(),
  pixelId:           text('pixel_id').notNull(),
  accessToken:       text('access_token').notNull(),
  graphApiVersion:   text('graph_api_version').notNull().default('v21.0'),
  isActive:          boolean('is_active').notNull().default(true),
  capiTriggerStages: uuid('capi_trigger_stages').array().notNull().default(sql`'{}'`),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
