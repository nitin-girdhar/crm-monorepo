import postgres from 'postgres';
import { appDb, tenantDb, serviceDb } from './client.js';

export type Tx = postgres.TransactionSql;
// Derives the params array type accepted by tx.unsafe() without importing postgres directly in services.
export type SqlParams = NonNullable<Parameters<Tx['unsafe']>[1]>;
type TxFn<T> = (tx: Tx) => Promise<T>;

export async function withOrgTx<T>(
  org_id: string,
  user_id: string,
  fn: TxFn<T>,
): Promise<T> {
  // postgres.begin() returns UnwrapPromiseArray<T>; cast needed because T will never be an array
  return appDb().begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE app_user`);
    await tx.unsafe(`SELECT set_config('app.current_org_id', $1, true)`, [org_id]);
    await tx.unsafe(`SELECT set_config('app.current_user_id', $1, true)`, [user_id]);
    return fn(tx);
  }) as unknown as Promise<T>;
}

export async function withTenantTx<T>(
  tenant_id: string,
  user_id: string,
  fn: TxFn<T>,
): Promise<T> {
  return tenantDb().begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE tenant_admin`);
    await tx.unsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenant_id]);
    await tx.unsafe(`SELECT set_config('app.current_user_id', $1, true)`, [user_id]);
    return fn(tx);
  }) as unknown as Promise<T>;
}

export async function withServiceTx<T>(fn: TxFn<T>): Promise<T> {
  return serviceDb().begin(async (tx) => {
    return fn(tx);
  }) as unknown as Promise<T>;
}
