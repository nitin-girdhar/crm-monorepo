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

// ── Role-aware transaction wrapper ────────────────────────────────────────────
// Maps the application user role to the correct PostgreSQL role + connection:
//   super_admin   → crm_service  (BYPASSRLS, serviceDb; sets user_id for audit)
//   tenant_admin  → tenant_admin (tenant-scoped RLS, tenantDb)
//   everyone else → app_user     (org-scoped RLS, appDb)
//
// Always prefer withRoleTx over calling withOrgTx/withTenantTx/withServiceTx
// directly in service code — it ensures the DB role matches the app role.

export interface RoleTxContext {
  role: string;
  org_id: string;
  tenant_id: string;
  user_id: string;
}

export async function withRoleTx<T>(ctx: RoleTxContext, fn: TxFn<T>): Promise<T> {
  if (ctx.role === 'super_admin') {
    // crm_service has BYPASSRLS; still set user_id so audit triggers capture the actor.
    return serviceDb().begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.current_user_id', $1, true)`, [ctx.user_id]);
      return fn(tx);
    }) as unknown as Promise<T>;
  }
  if (ctx.role === 'tenant_admin') {
    return withTenantTx(ctx.tenant_id, ctx.user_id, fn);
  }
  return withOrgTx(ctx.org_id, ctx.user_id, fn);
}
