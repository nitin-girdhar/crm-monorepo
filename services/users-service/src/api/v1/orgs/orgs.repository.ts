import { sql, asc } from 'drizzle-orm';
import { withRoleTx, withServiceTx } from '@crm/db';
import type { RoleTxContext } from '@crm/db';
import { leadSourcesTable } from '@crm/db/schema';

export interface LocationFilter {
  cityIds?:    number[];
  stateIds?:   number[];
  countryIds?: number[];
}

export async function getOrgs(ctx: RoleTxContext, filter: LocationFilter) {
  const isTenantWide = ctx.role === 'tenant_admin' || ctx.role === 'super_admin';
  return withRoleTx(ctx, async (tx) => {
    const scopeClause = isTenantWide
      ? sql`o.tenant_id = (SELECT tenant_id FROM entity.organizations WHERE id = ${ctx.org_id}::uuid)`
      : sql`o.id = ${ctx.org_id}::uuid`;

    let locationClause = sql``;
    if (filter.cityIds?.length) {
      locationClause = sql`AND o.city_id = ANY(${filter.cityIds}::int[])`;
    } else if (filter.stateIds?.length) {
      locationClause = sql`AND o.state_id = ANY(${filter.stateIds}::smallint[])`;
    } else if (filter.countryIds?.length) {
      locationClause = sql`AND o.country_id = ANY(${filter.countryIds}::smallint[])`;
    }

    return (await tx.execute(sql`
      SELECT o.id, o.name,
             o.city_id    AS "cityId",
             o.state_id   AS "stateId",
             o.country_id AS "countryId"
      FROM entity.organizations o
      WHERE ${scopeClause} AND NOT o.is_deleted AND o.is_active
        ${locationClause}
      ORDER BY o.name
    `)) as Array<Record<string, unknown>>;
  });
}

export async function getAllOrgs(ctx: Pick<RoleTxContext, 'org_id'>) {
  return withServiceTx(async (tx) => {
    return (await tx.execute(sql`
      SELECT o.id, o.name
      FROM entity.organizations o
      WHERE o.tenant_id = (
        SELECT tenant_id FROM entity.organizations WHERE id = ${ctx.org_id}::uuid
      )
      AND NOT o.is_deleted AND o.is_active
      ORDER BY o.name
    `)) as Array<{ id: string; name: string }>;
  });
}

export async function getLeadSources() {
  return withServiceTx(async (tx) => {
    return tx
      .select({ id: leadSourcesTable.id, name: leadSourcesTable.name })
      .from(leadSourcesTable)
      .orderBy(asc(leadSourcesTable.name));
  });
}
