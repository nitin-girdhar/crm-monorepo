import { createHash } from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import { withServiceTx, resolveAutoAssignedUser } from '@crm/db';
import {
  leadStageTable,
  leadSourcesTable,
  marketingLeadsTable,
  leadLinksTable,
} from '@crm/db/schema';
import { UnauthorizedError, BadRequestError } from '../../../lib/errors.js';

export interface WebhookLeadData {
  org_id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  city?: string;
  address_line1?: string;
  address_line2?: string;
  pincode?: string;
  city_id?: number;
  state_id?: number;
  country_id?: number;
  source_id?: string;
  source?: string;
  campaign_id?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  raw_webhook_data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WebhookLeadResult {
  id: string;
  is_duplicate: boolean;
  existing_lead_id: string | null;
}

// Resolves org_id from a plaintext API key by looking up its SHA-256 hash.
// Uses the service DB role so it can bypass RLS for the lookup.
export async function resolveOrgFromApiKey(rawKey: string): Promise<string> {
  const keyHash = createHash('sha256').update(rawKey).digest('hex');

  return withServiceTx(async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT org_id FROM crm.org_api_keys
      WHERE key_hash = ${keyHash} AND is_active = true
      LIMIT 1
    `)) as Array<{ org_id: string }>;

    if (!rows[0]) throw new UnauthorizedError('Invalid or inactive API key');
    return rows[0].org_id;
  });
}

// Canonical lead creation for external/intake sources (website, meta, third-party).
// Uses the service DB role (bypasses RLS) and applies the same dedup + auto-assign
// logic used by the meta webhook path.
export async function createWebhookLead(data: WebhookLeadData): Promise<WebhookLeadResult> {
  if (!data.org_id) throw new BadRequestError('org_id is required');
  if (!data.phone && !data.email) throw new BadRequestError('At least one of phone or email is required');

  return withServiceTx(async (tx) => {
    const [defaultStage] = await tx
      .select({ id: leadStageTable.id })
      .from(leadStageTable)
      .where(eq(leadStageTable.name, 'new'))
      .limit(1);
    if (!defaultStage) throw new Error('Lead stage "new" not found');

    let sourceId: string | null = data.source_id ?? null;
    if (!sourceId && data.source) {
      const [src] = await tx
        .select({ id: leadSourcesTable.id })
        .from(leadSourcesTable)
        .where(eq(leadSourcesTable.name, String(data.source)))
        .limit(1);
      sourceId = src?.id ?? null;
    }

    // Dedup: check for existing active lead with same phone in this org.
    // If found, mark it inactive + create a lead_link supersession record,
    // then insert the new lead as the active record.
    let existingLeadId: string | null = null;

    if (data.phone) {
      const rows = (await tx.execute(sql`
        SELECT id FROM crm.marketing_leads
        WHERE org_id = ${data.org_id}::uuid
          AND phone = ${data.phone}
          AND is_active = true
          AND NOT is_deleted
        LIMIT 1
      `)) as Array<{ id: string }>;
      existingLeadId = rows[0]?.id ?? null;
    }

    // Dedup by email only if no phone match found
    if (!existingLeadId && data.email) {
      const rows = (await tx.execute(sql`
        SELECT id FROM crm.marketing_leads
        WHERE org_id = ${data.org_id}::uuid
          AND email = ${data.email}
          AND is_active = true
          AND NOT is_deleted
        LIMIT 1
      `)) as Array<{ id: string }>;

      // Email match: this is an update/re-submission, not a new lead — return early
      if (rows[0]) {
        return { id: rows[0].id, is_duplicate: true, existing_lead_id: rows[0].id };
      }
    }

    // Mark the existing phone-matched lead inactive before inserting the new one.
    // (The unique index on (org_id, phone) WHERE is_active = true requires this ordering.)
    if (existingLeadId) {
      await tx.execute(sql`
        UPDATE crm.marketing_leads
        SET is_active = false, updated_at = NOW()
        WHERE id = ${existingLeadId}::uuid
      `);
    }

    const autoAssignedUserId = await resolveAutoAssignedUser(tx, data.org_id);

    const [inserted] = await tx
      .insert(marketingLeadsTable)
      .values({
        orgId:         data.org_id,
        firstName:     String(data.first_name ?? ''),
        lastName:      String(data.last_name ?? ''),
        phone:         data.phone ?? null,
        email:         data.email ?? null,
        city:          data.city ?? null,
        addressLine1:  data.address_line1 ?? null,
        addressLine2:  data.address_line2 ?? null,
        pincode:       data.pincode ?? null,
        cityId:        data.city_id ?? null,
        stateId:       data.state_id ?? null,
        countryId:     data.country_id ?? null,
        stageId:       defaultStage.id,
        sourceId,
        campaignId:    data.campaign_id ?? null,
        assignedUserId: autoAssignedUserId,
        tags:          Array.isArray(data.tags) ? data.tags.map(String) : [],
        metadata:      (data.metadata ?? {}) as Record<string, unknown>,
        rawWebhookData: (data.raw_webhook_data ?? {}) as Record<string, unknown>,
      })
      .returning({ id: marketingLeadsTable.id });

    const newLeadId = inserted!.id;

    // Write the merge/supersession audit link for the old lead
    if (existingLeadId) {
      await tx
        .insert(leadLinksTable)
        .values({
          sourceLeadId: existingLeadId,
          sourceOrgId:  data.org_id,
          destLeadId:   newLeadId,
          destOrgId:    data.org_id,
          linkType:     'merge',
          status:       'completed',
        });

      // Point the superseded lead forward
      await tx.execute(sql`
        UPDATE crm.marketing_leads
        SET superseded_by = ${newLeadId}::uuid
        WHERE id = ${existingLeadId}::uuid
      `);
    }

    return { id: newLeadId, is_duplicate: false, existing_lead_id: existingLeadId };
  });
}
