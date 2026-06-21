import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import { appDb, tenantDb, serviceDb } from './client.js';
import * as schema from './schema/index.js';

type SchemaDb = PostgresJsDatabase<typeof schema>;

function makeDrizzle(client: ReturnType<typeof appDb>): SchemaDb {
  return drizzle(client as unknown as Sql, { schema });
}

let _app: SchemaDb | null = null;
let _tenant: SchemaDb | null = null;
let _service: SchemaDb | null = null;

export function appDrizzle(): SchemaDb {
  if (!_app) _app = makeDrizzle(appDb());
  return _app;
}

export function tenantDrizzle(): SchemaDb {
  if (!_tenant) _tenant = makeDrizzle(tenantDb());
  return _tenant;
}

export function serviceDrizzle(): SchemaDb {
  if (!_service) _service = makeDrizzle(serviceDb());
  return _service;
}

export type DrizzleTx = Parameters<Parameters<SchemaDb['transaction']>[0]>[0];
