import { sql } from 'drizzle-orm';
import { withServiceTx, withRoleTx, type RoleTxContext } from '@crm/db';

export interface MetaIntegration {
  id: string;
  org_id: string;
  app_secret: string;
  verify_token: string;
  pixel_id: string;
  access_token: string;
  graph_api_version: string;
  is_active: boolean;
  capi_trigger_stages: string[];
}

export async function getIntegrationById(integrationId: string): Promise<MetaIntegration | null> {
  return withServiceTx(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, org_id, app_secret, verify_token, pixel_id, access_token,
                 graph_api_version, is_active, capi_trigger_stages
          FROM ext.meta_org_config
          WHERE id = ${integrationId} AND is_active = true
          LIMIT 1`,
    );
    return (rows as unknown as MetaIntegration[])[0] ?? null;
  });
}

export async function getIntegrationByOrgId(orgId: string): Promise<MetaIntegration | null> {
  return withServiceTx(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, org_id, app_secret, verify_token, pixel_id, access_token,
                 graph_api_version, is_active, capi_trigger_stages
          FROM ext.meta_org_config
          WHERE org_id = ${orgId}
          LIMIT 1`,
    );
    return (rows as unknown as MetaIntegration[])[0] ?? null;
  });
}

export interface CreateIntegrationInput {
  org_id: string;
  app_secret: string;
  verify_token: string;
  pixel_id: string;
  access_token: string;
  graph_api_version?: string | undefined;
  capi_trigger_stages?: string[] | undefined;
}

export async function createIntegration(ctx: RoleTxContext, data: CreateIntegrationInput): Promise<{ id: string }> {
  const stagesArray = data.capi_trigger_stages ?? [];
  const stagesSql = stagesArray.length > 0
    ? sql.raw(`ARRAY[${stagesArray.map(s => `'${s}'`).join(',')}]::uuid[]`)
    : sql.raw(`'{}'::uuid[]`);

  return withRoleTx(ctx, async (tx) => {
    const rows = await tx.execute(
      sql`INSERT INTO ext.meta_org_config (org_id, app_secret, verify_token, pixel_id, access_token, graph_api_version, capi_trigger_stages)
          VALUES (${data.org_id}, ${data.app_secret}, ${data.verify_token}, ${data.pixel_id}, ${data.access_token},
                  ${data.graph_api_version ?? 'v21.0'}, ${stagesSql})
          RETURNING id`,
    );
    return (rows as unknown as Array<{ id: string }>)[0]!;
  });
}

export interface UpdateIntegrationInput {
  app_secret?: string | undefined;
  verify_token?: string | undefined;
  pixel_id?: string | undefined;
  access_token?: string | undefined;
  graph_api_version?: string | undefined;
  is_active?: boolean | undefined;
  capi_trigger_stages?: string[] | undefined;
}

export async function updateIntegration(ctx: RoleTxContext, data: UpdateIntegrationInput): Promise<void> {
  const setClauses: string[] = ['updated_at = NOW()'];

  if (data.app_secret !== undefined)        setClauses.push(`app_secret = '${data.app_secret}'`);
  if (data.verify_token !== undefined)      setClauses.push(`verify_token = '${data.verify_token}'`);
  if (data.pixel_id !== undefined)          setClauses.push(`pixel_id = '${data.pixel_id}'`);
  if (data.access_token !== undefined)      setClauses.push(`access_token = '${data.access_token}'`);
  if (data.graph_api_version !== undefined) setClauses.push(`graph_api_version = '${data.graph_api_version}'`);
  if (data.is_active !== undefined)         setClauses.push(`is_active = ${data.is_active}`);
  if (data.capi_trigger_stages !== undefined) {
    const arr = data.capi_trigger_stages.length > 0
      ? `ARRAY[${data.capi_trigger_stages.map(s => `'${s}'`).join(',')}]::uuid[]`
      : `'{}'::uuid[]`;
    setClauses.push(`capi_trigger_stages = ${arr}`);
  }

  await withRoleTx(ctx, async (tx) => {
    await tx.execute(
      sql`UPDATE ext.meta_org_config
          SET ${sql.raw(setClauses.join(', '))}
          WHERE org_id = ${ctx.org_id}`,
    );
  });
}
