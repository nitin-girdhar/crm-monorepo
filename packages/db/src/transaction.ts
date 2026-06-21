import { sql } from 'drizzle-orm';
import { appDrizzle, tenantDrizzle, serviceDrizzle, type DrizzleTx } from './drizzle.js';

export type { DrizzleTx };

export interface RoleTxContext {
  role: string;
  org_id: string;
  tenant_id: string;
  user_id: string;
}

export async function withRoleTx<T>(ctx: RoleTxContext, fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
  if (ctx.role === 'super_admin') {
    return serviceDrizzle().transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_user_id', ${ctx.user_id}, true)`);
      if (ctx.org_id) await tx.execute(sql`SELECT set_config('app.current_org_id', ${ctx.org_id}, true)`);
      if (ctx.tenant_id) await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${ctx.tenant_id}, true)`);
      return fn(tx);
    });
  }
  if (ctx.role === 'tenant_admin') {
    return tenantDrizzle().transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE tenant_admin`));
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${ctx.tenant_id}, true)`);
      await tx.execute(sql`SELECT set_config('app.current_user_id', ${ctx.user_id}, true)`);
      // Set org_id so audit triggers and any org-scoped policy checks have context.
      // For tenant_admin the tenant_isolation_policy already governs cross-org access;
      // this does not restrict them to a single org.
      await tx.execute(sql`SELECT set_config('app.current_org_id', ${ctx.org_id}, true)`);
      return fn(tx);
    });
  }
  return appDrizzle().transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL ROLE app_user`));
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${ctx.org_id}, true)`);
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${ctx.user_id}, true)`);
    return fn(tx);
  });
}

export async function withServiceTx<T>(fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
  return serviceDrizzle().transaction(fn);
}
