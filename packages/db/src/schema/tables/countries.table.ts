import { smallint, text, varchar } from 'drizzle-orm/pg-core';
import { geoSchema } from '../pg-schemas';

export const countriesTable = geoSchema.table('countries', {
  id:          smallint('id').primaryKey().generatedAlwaysAsIdentity(),
  name:        text('name').notNull(),
  isoCode:     varchar('iso_code', { length: 2 }).notNull(),
  description: text('description'),
});
