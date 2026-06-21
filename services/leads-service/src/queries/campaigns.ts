import { withRoleTx, withServiceTx } from '@crm/db';
import type { RoleTxContext } from '@crm/db';

const CAMPAIGN_SELECT = `
  SELECT ac.id, ac.org_id, ac.name, ac.budget, ac.started_at, ac.ended_at, ac.created_at, ac.updated_at,
         mp.name AS platform_name, cs.name AS status_name, cs.id AS status_id, mp.id AS platform_id,
         COUNT(ml.id) FILTER (WHERE NOT ml.is_deleted) AS lead_count
  FROM marketing.ad_campaigns ac
  JOIN marketing.marketing_platforms mp ON mp.id = ac.platform_id
  JOIN marketing.campaign_statuses cs ON cs.id = ac.status_id
  LEFT JOIN crm.marketing_leads ml ON ml.campaign_id = ac.id
  WHERE NOT ac.is_deleted
`;

export async function listCampaigns(
  org_id: string,
  user_id: string,
  role = 'org_admin',
  tenant_id = '',
) {
  const ctx: RoleTxContext = { role, org_id, tenant_id, user_id };
  return withRoleTx(ctx, async (tx) => {
    return tx.unsafe(
      `${CAMPAIGN_SELECT} AND ac.org_id = $1
       GROUP BY ac.id, mp.name, cs.name, cs.id, mp.id
       ORDER BY ac.created_at DESC`,
      [org_id],
    );
  });
}

export async function getCampaignById(
  org_id: string,
  user_id: string,
  campaign_id: string,
  role = 'org_admin',
  tenant_id = '',
) {
  const ctx: RoleTxContext = { role, org_id, tenant_id, user_id };
  return withRoleTx(ctx, async (tx) => {
    const rows = await tx.unsafe(
      `${CAMPAIGN_SELECT} AND ac.org_id = $1 AND ac.id = $2
       GROUP BY ac.id, mp.name, cs.name, cs.id, mp.id`,
      [org_id, campaign_id],
    );
    return (rows as Array<Record<string, unknown>>)[0] ?? null;
  });
}

export async function listMarketingPlatforms() {
  return withServiceTx(async (tx) => {
    return tx.unsafe(`SELECT id, name, description FROM marketing.marketing_platforms ORDER BY name`);
  });
}

export async function listCampaignStatuses() {
  return withServiceTx(async (tx) => {
    return tx.unsafe(`SELECT id, name, description FROM marketing.campaign_statuses ORDER BY name`);
  });
}
