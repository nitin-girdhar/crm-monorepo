import { sql, asc, eq } from 'drizzle-orm';
import { withRoleTx, withServiceTx } from '@crm/db';
import type { RoleTxContext } from '@crm/db';
import { organizationsTable, leadSourcesTable } from '@crm/db/schema';

export interface LocationFilter {
  cityIds?:    number[];
  stateIds?:   number[];
  countryIds?: number[];
}

export async function getBranches(ctx: RoleTxContext, filter: LocationFilter) {
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

export async function getAllBranches(ctx: RoleTxContext) {
  return withRoleTx(ctx, async (tx) => {
    return tx
      .select({
        id:        organizationsTable.id,
        name:      organizationsTable.name,
        cityId:    organizationsTable.cityId,
        stateId:   organizationsTable.stateId,
        countryId: organizationsTable.countryId,
      })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, ctx.org_id))
      .orderBy(asc(organizationsTable.name));
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
