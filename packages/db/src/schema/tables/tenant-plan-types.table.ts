import { uuid, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { entitySchema } from '../pg-schemas';

export const tenantPlanTypesTable = entitySchema.table('tenant_plan_types', {
  id:          uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  name:        text('name').notNull().unique(),
  description: text('description'),
});
