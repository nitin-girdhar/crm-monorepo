import { smallint, text } from 'drizzle-orm/pg-core';
import { geoSchema } from '../pg-schemas';

export const statesTable = geoSchema.table('states', {
  id:          smallint('id').primaryKey().generatedAlwaysAsIdentity(),
  countryId:   smallint('country_id').notNull(),
  name:        text('name').notNull(),
  code:        text('code'),
  description: text('description'),
});
