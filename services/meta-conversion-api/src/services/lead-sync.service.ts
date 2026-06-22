import { sql } from 'drizzle-orm';
import { withServiceTx } from '@crm/db';
import { metaConfig } from '../config/meta.config.js';

export interface MetaLeadFieldData {
  name: string;
  values: string[];
}

export interface RawMetaLead {
  id: string;
  form_id: string;
  page_id: string;
  created_time?: number | undefined;
  ad_id?: string | undefined;
  adset_id?: string | undefined;
  campaign_id?: string | undefined;
  field_data: MetaLeadFieldData[];
}

export interface SyncLeadResult {
  metaLeadRowId: string;
  marketingLeadId: string;
  isDuplicate: boolean;
}

/**
 * Safely convert a string to BigInt, returning null when the value is
 * not a valid integer representation (e.g. 'unknown', undefined, '').
 */
function safeBigInt(value: string | undefined | null): bigint | null {
  if (value == null || value === '') return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function extractFieldValue(fieldData: MetaLeadFieldData[], metaKey: string): string | undefined {
  const field = fieldData.find((f) => f.name === metaKey);
  return field?.values[0]?.trim() || undefined;
}

function buildContactPayload(fieldData: MetaLeadFieldData[]) {
  const phone = extractFieldValue(fieldData, 'phone');
  if (!phone) throw new Error('Lead payload is missing a required phone value');

  const email = extractFieldValue(fieldData, 'email') ?? null;
  let firstName: string | null = null;
  let lastName: string | null = null;
  const fullName = extractFieldValue(fieldData, 'full_name') ?? null;

  if (fullName) {
    const parts = fullName.split(' ');
    firstName = parts[0] ?? null;
    lastName = parts.slice(1).join(' ') || null;
  }

  const fnVal = extractFieldValue(fieldData, 'first_name');
  if (fnVal) firstName = fnVal;
  const lnVal = extractFieldValue(fieldData, 'last_name');
  if (lnVal) lastName = lnVal;

  const whatsappNumber = extractFieldValue(fieldData, 'whatsapp_number') ?? null;

  return { email, phone, firstName, lastName, fullName, whatsappNumber };
}

export async function syncLeadToDatabase(
  orgId: string,
  lead: RawMetaLead,
): Promise<SyncLeadResult> {
  const contact = buildContactPayload(lead.field_data);

  return withServiceTx(async (tx) => {
    // Dedup: check if this Meta lead was already synced
    const metaLeadBigId = safeBigInt(lead.id);
    if (metaLeadBigId === null) {
      throw new Error(`Invalid Meta lead ID: "${lead.id}" is not a numeric value`);
    }

    const existing = await tx.execute(
      sql`SELECT id, marketing_lead_id FROM ext.meta_leads WHERE meta_lead_id = ${metaLeadBigId} LIMIT 1`,
    );
    const existingRows = existing as unknown as Array<{ id: string; marketing_lead_id: string }>;
    const existingRow = existingRows[0];

    if (existingRow) {
      return {
        metaLeadRowId: existingRow.id,
        marketingLeadId: existingRow.marketing_lead_id,
        isDuplicate: true,
      };
    }

    // Lookup 'new' stage and 'facebook' source
    const stageResult = await tx.execute(
      sql`SELECT id FROM crm.lead_stage WHERE name = 'new' LIMIT 1`,
    );
    const stageId = (stageResult as unknown as Array<{ id: string }>)[0]?.id;

    const sourceResult = await tx.execute(
      sql`SELECT id FROM crm.lead_sources WHERE name = 'facebook' LIMIT 1`,
    );
    const sourceId = (sourceResult as unknown as Array<{ id: string }>)[0]?.id;

    // Insert into crm.marketing_leads
    const leadCreatedAt = lead.created_time
      ? new Date(lead.created_time * 1000)
      : new Date();

    const marketingLeadResult = await tx.execute(
      sql`INSERT INTO crm.marketing_leads (
            org_id, first_name, middle_name, last_name, phone, email,
            stage_id, source_id, metadata, created_at
          ) VALUES (
            ${orgId},
            ${contact.firstName ?? ''},
            ${null},
            ${contact.lastName ?? ''},
            ${contact.phone},
            ${contact.email},
            ${stageId ?? null},
            ${sourceId ?? null},
            ${JSON.stringify({ meta_lead_id: lead.id, form_id: lead.form_id, platform: 'facebook' })},
            ${leadCreatedAt.toISOString()}
          )
          ON CONFLICT (org_id, phone) WHERE phone IS NOT NULL AND NOT is_deleted
          DO UPDATE SET
            email      = COALESCE(crm.marketing_leads.email, EXCLUDED.email),
            first_name = COALESCE(NULLIF(crm.marketing_leads.first_name, ''), EXCLUDED.first_name),
            last_name  = COALESCE(NULLIF(crm.marketing_leads.last_name,  ''), EXCLUDED.last_name),
            updated_at = NOW()
          RETURNING id`,
    );
    const marketingLeadId = (marketingLeadResult as unknown as Array<{ id: string }>)[0]!.id;

    // Insert into ext.meta_leads
    const metaLeadResult = await tx.execute(
      sql`INSERT INTO ext.meta_leads (
            org_id, marketing_lead_id, meta_lead_id, form_id, campaign_id, adset_id, ad_id,
            platform, lead_created_at, full_name, first_name, last_name, email, phone,
            whatsapp_number, raw_field_data
          ) VALUES (
            ${orgId}, ${marketingLeadId}, ${metaLeadBigId}, ${safeBigInt(lead.form_id) ?? BigInt(0)},
            ${safeBigInt(lead.campaign_id)},
            ${safeBigInt(lead.adset_id)},
            ${safeBigInt(lead.ad_id)},
            ${'fb'}, ${leadCreatedAt.toISOString()},
            ${contact.fullName}, ${contact.firstName}, ${contact.lastName},
            ${contact.email}, ${contact.phone}, ${contact.whatsappNumber},
            ${JSON.stringify(lead.field_data)}
          )
          RETURNING id`,
    );
    const metaLeadRowId = (metaLeadResult as unknown as Array<{ id: string }>)[0]!.id;

    // Insert custom fields for unmapped data
    const knownKeys = new Set([
      ...metaConfig.field_mappings.map((m) => m.meta_key),
      'whatsapp_number',
    ]);

    const customFields = lead.field_data
      .filter((f) => !knownKeys.has(f.name) && f.values[0]?.trim())
      .map((f) => ({ metaLeadId: metaLeadRowId, key: f.name, value: f.values[0]!.trim() }));

    for (const cf of customFields) {
      await tx.execute(
        sql`INSERT INTO ext.meta_lead_custom_fields (meta_lead_id, org_id, question_key, question_value)
            VALUES (${cf.metaLeadId}, ${orgId}, ${cf.key}, ${cf.value})
            ON CONFLICT (meta_lead_id, question_key) DO NOTHING`,
      );
    }

    return { metaLeadRowId, marketingLeadId, isDuplicate: false };
  });
}
