import { smallint, text, unique } from 'drizzle-orm/pg-core';
import { geoSchema } from '../pg-schemas';
import { countriesTable } from './countries.table';

export const statesTable = geoSchema.table('states', {
  id:          smallint('id').primaryKey().generatedAlwaysAsIdentity(),
  countryId:   smallint('country_id').notNull().references(() => countriesTable.id, { onDelete: 'restrict' }),
  name:        text('name').notNull(),
  code:        text('code'),
  description: text('description'),
}, (t) => ({
  uqStatesCountryName: unique('uq_states_country_name').on(t.countryId, t.name),
}));
