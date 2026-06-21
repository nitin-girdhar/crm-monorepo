import { uuid, text, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { iamSchema } from '../pg-schemas';

export const userRolesTable = iamSchema.table('user_roles', {
  id:          uuid('id').primaryKey().default(sql`gen_uuidv7()`),
  name:        text('name').notNull(),
  label:       text('label').notNull(),
  description: text('description'),
  rank:        integer('rank').notNull().default(0),
});
