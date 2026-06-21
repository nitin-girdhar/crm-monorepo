import { integer, smallint, text } from 'drizzle-orm/pg-core';
import { geoSchema } from '../pg-schemas';

export const citiesTable = geoSchema.table('cities', {
  id:          integer('id').primaryKey().generatedAlwaysAsIdentity(),
  stateId:     smallint('state_id').notNull(),
  name:        text('name').notNull(),
  description: text('description'),
});
