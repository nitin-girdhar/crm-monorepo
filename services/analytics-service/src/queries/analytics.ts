import { withOrgTx, withTenantTx, withServiceTx } from '@crm/db';

async function resolveTenantId(org_id: string): Promise<string> {
  return withServiceTx(async (tx) => {
    const rows = await tx.unsafe<Array<{ tenant_id: string }>>(
      `SELECT tenant_id FROM entity.organizations WHERE id = $1 LIMIT 1`,
      [org_id],
    );
    const row = rows[0];
    if (!row) throw new Error(`Organization not found: ${org_id}`);
    return row.tenant_id;
  });
}

export async function getOrgPerformanceSnapshot(org_id: string, user_id: string) {
  return withOrgTx(org_id, user_id, async (tx) => {
    const rows = await tx.unsafe(
      `SELECT * FROM crm.vw_org_performance_snapshot WHERE org_id = $1`,
      [org_id],
    );
    return (rows as Array<Record<string, unknown>>)[0] ?? null;
  });
}

export async function getTenantDashboard(org_id: string, user_id: string) {
  const tenant_id = await resolveTenantId(org_id);
  return withTenantTx(tenant_id, user_id, async (tx) => {
    const rows = await tx.unsafe(
      `SELECT * FROM crm.vw_tenant_full_dashboard WHERE tenant_id = $1`,
      [tenant_id],
    );
    return rows as Array<Record<string, unknown>>;
  });
}

export async function getTenantCampaignSummary(org_id: string, user_id: string) {
  const tenant_id = await resolveTenantId(org_id);
  return withTenantTx(tenant_id, user_id, async (tx) => {
    return tx.unsafe(
      `SELECT * FROM marketing.vw_tenant_campaign_summary WHERE tenant_id = $1 ORDER BY campaign_name`,
      [tenant_id],
    );
  });
}

export async function getPipelineByStage(org_id: string, user_id: string) {
  return withOrgTx(org_id, user_id, async (tx) => {
    return tx.unsafe(
      `SELECT ls.name AS stage, ls.label AS stage_label, COUNT(ml.id)::INT AS count
       FROM crm.lead_stage ls
       LEFT JOIN crm.marketing_leads ml
         ON ml.stage_id = ls.id AND ml.org_id = $1 AND NOT ml.is_deleted
       GROUP BY ls.id, ls.name, ls.label
       ORDER BY ls.sort_order`,
      [org_id],
    );
  });
}
