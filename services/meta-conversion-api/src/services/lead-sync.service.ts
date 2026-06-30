import { sql } from 'drizzle-orm';
import { withServiceTx } from '@crm/db';
import { resolveFieldMappings, type FieldMappingsConfig, type ResolvedFieldMappings } from '../config/meta.config.js';

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

function extractByKeys(fieldData: MetaLeadFieldData[], keys: string[] | undefined): string | undefined {
  for (const key of keys ?? []) {
    const v = extractFieldValue(fieldData, key);
    if (v) return v;
  }
  return undefined;
}

function buildContactPayload(fieldData: MetaLeadFieldData[], mappings: ResolvedFieldMappings) {
  const phone = extractByKeys(fieldData, mappings.contact.phone);
  if (!phone) throw new Error('Lead payload is missing a required phone value');

  const email = extractByKeys(fieldData, mappings.contact.email) ?? null;
  let firstName: string | null = null;
  let lastName: string | null = null;
  const fullName = extractByKeys(fieldData, mappings.contact.full_name) ?? null;

  if (fullName) {
    const parts = fullName.split(' ');
    firstName = parts[0] ?? null;
    lastName = parts.slice(1).join(' ') || null;
  }

  const fnVal = extractByKeys(fieldData, mappings.contact.first_name);
  if (fnVal) firstName = fnVal;
  const lnVal = extractByKeys(fieldData, mappings.contact.last_name);
  if (lnVal) lastName = lnVal;

  const whatsappNumber = extractByKeys(fieldData, mappings.contact.whatsapp_number) ?? null;

  return { email, phone, firstName, lastName, fullName, whatsappNumber };
}

function buildAddressPayload(fieldData: MetaLeadFieldData[], mappings: ResolvedFieldMappings) {
  return {
    streetAddress: extractByKeys(fieldData, mappings.address.street_address) ?? null,
    city: extractByKeys(fieldData, mappings.address.city) ?? null,
    state: extractByKeys(fieldData, mappings.address.state) ?? null,
    province: extractByKeys(fieldData, mappings.address.province) ?? null,
    country: extractByKeys(fieldData, mappings.address.country) ?? null,
    postalCode: extractByKeys(fieldData, mappings.address.postal_code) ?? null,
    zipCode: extractByKeys(fieldData, mappings.address.zip_code) ?? null,
  };
}

function buildProfessionalPayload(fieldData: MetaLeadFieldData[], mappings: ResolvedFieldMappings) {
  return {
    jobTitle: extractByKeys(fieldData, mappings.professional.job_title) ?? null,
    companyName: extractByKeys(fieldData, mappings.professional.company_name) ?? null,
    workEmail: extractByKeys(fieldData, mappings.professional.work_email) ?? null,
    workPhoneNumber: extractByKeys(fieldData, mappings.professional.work_phone_number) ?? null,
  };
}

function buildDemographicsPayload(fieldData: MetaLeadFieldData[], mappings: ResolvedFieldMappings) {
  return {
    dateOfBirth: extractByKeys(fieldData, mappings.demographics.date_of_birth) ?? null,
    gender: extractByKeys(fieldData, mappings.demographics.gender) ?? null,
    maritalStatus: extractByKeys(fieldData, mappings.demographics.marital_status) ?? null,
    relationshipStatus: extractByKeys(fieldData, mappings.demographics.relationship_status) ?? null,
    militaryStatus: extractByKeys(fieldData, mappings.demographics.military_status) ?? null,
  };
}

function hasAnyValue(payload: Record<string, string | null>): boolean {
  return Object.values(payload).some((v) => v !== null);
}

export async function syncLeadToDatabase(
  orgId: string,
  lead: RawMetaLead,
  orgFieldMappings?: FieldMappingsConfig | null,
): Promise<SyncLeadResult> {
  const mappings = resolveFieldMappings(orgFieldMappings);
  const contact = buildContactPayload(lead.field_data, mappings);
  const address = buildAddressPayload(lead.field_data, mappings);
  const professional = buildProfessionalPayload(lead.field_data, mappings);
  const demographics = buildDemographicsPayload(lead.field_data, mappings);

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

    // Insert into crm.marketing_leads — always insert a new row (never upsert).
    // If an active lead with the same phone already exists, mark the old row as superseded.
    const leadCreatedAt = lead.created_time
      ? new Date(lead.created_time * 1000)
      : new Date();

    // Find existing active lead for this org+phone (if any)
    const existingLeadResult = contact.phone
      ? await tx.execute(
          sql`SELECT id FROM crm.marketing_leads
              WHERE org_id = ${orgId}::uuid
                AND phone = ${contact.phone}
                AND is_active = true
                AND NOT is_deleted
              LIMIT 1`,
        )
      : ([] as Array<{ id: string }>);
    const existingLeadId = (existingLeadResult as unknown as Array<{ id: string }>)[0]?.id ?? null;

    // Mark the old row inactive BEFORE inserting the new one — the unique index on
    // (org_id, phone) WHERE is_active = true would fire if the old row is still active
    // at INSERT time, because PostgreSQL checks constraints before the row is written.
    if (existingLeadId) {
      await tx.execute(
        sql`UPDATE crm.marketing_leads
            SET is_active = false, updated_at = NOW()
            WHERE id = ${existingLeadId}::uuid`,
      );
    }

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
          RETURNING id`,
    );
    const marketingLeadId = (marketingLeadResult as unknown as Array<{ id: string }>)[0]!.id;

    // Now point the old row forward to the new one and write the audit record
    if (existingLeadId) {
      await tx.execute(
        sql`UPDATE crm.marketing_leads
            SET superseded_by = ${marketingLeadId}::uuid, updated_at = NOW()
            WHERE id = ${existingLeadId}::uuid`,
      );
      await tx.execute(
        sql`INSERT INTO crm.lead_links (source_lead_id, source_org_id, dest_lead_id, dest_org_id, link_type, status)
            VALUES (${existingLeadId}::uuid, ${orgId}::uuid, ${marketingLeadId}::uuid, ${orgId}::uuid, 'merge', 'completed')`,
      );
    }

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

    // Insert structured address/professional/demographics extensions when present
    if (hasAnyValue(address)) {
      await tx.execute(
        sql`INSERT INTO ext.meta_lead_addresses (
              meta_lead_id, org_id, street_address, city, state, province, country, postal_code, zip_code
            ) VALUES (
              ${metaLeadRowId}, ${orgId}, ${address.streetAddress}, ${address.city}, ${address.state},
              ${address.province}, ${address.country}, ${address.postalCode}, ${address.zipCode}
            )`,
      );
    }

    if (hasAnyValue(professional)) {
      await tx.execute(
        sql`INSERT INTO ext.meta_lead_professional (
              meta_lead_id, org_id, job_title, company_name, work_email, work_phone_number
            ) VALUES (
              ${metaLeadRowId}, ${orgId}, ${professional.jobTitle}, ${professional.companyName},
              ${professional.workEmail}, ${professional.workPhoneNumber}
            )`,
      );
    }

    if (hasAnyValue(demographics)) {
      await tx.execute(
        sql`INSERT INTO ext.meta_lead_demographics (
              meta_lead_id, org_id, date_of_birth, gender, marital_status, relationship_status, military_status
            ) VALUES (
              ${metaLeadRowId}, ${orgId}, ${demographics.dateOfBirth}, ${demographics.gender},
              ${demographics.maritalStatus}, ${demographics.relationshipStatus}, ${demographics.militaryStatus}
            )`,
      );
    }

    // Insert custom fields for any remaining unmapped data
    const knownKeys = new Set([
      ...Object.values(mappings.contact).flat(),
      ...Object.values(mappings.address).flat(),
      ...Object.values(mappings.professional).flat(),
      ...Object.values(mappings.demographics).flat(),
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
