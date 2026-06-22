import { integer, smallint, text, unique } from 'drizzle-orm/pg-core';
import { geoSchema } from '../pg-schemas';
import { statesTable } from './states.table';

export const citiesTable = geoSchema.table('cities', {
  id:          integer('id').primaryKey().generatedAlwaysAsIdentity(),
  stateId:     smallint('state_id').notNull().references(() => statesTable.id, { onDelete: 'restrict' }),
  name:        text('name').notNull(),
  description: text('description'),
}, (t) => ({
  uqCitiesStateName: unique('uq_cities_state_name').on(t.stateId, t.name),
}));
