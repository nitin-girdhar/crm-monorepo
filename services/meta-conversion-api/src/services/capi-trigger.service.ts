import { sql } from 'drizzle-orm';
import { withServiceTx } from '@crm/db';
import { getIntegrationByOrgId } from './integration.service.js';
import { sendCapiEvent } from './meta-api.service.js';
import { buildCapiPayload } from './capi-payload.builder.js';
import type { ActionSource } from './capi-payload.builder.js';

export interface CapiTriggerInput {
  marketingLeadId: string;
  orgId: string;
  eventName?: string | undefined;
  actionSource?: ActionSource | undefined;
  triggeredBy: 'auto_stage_change' | 'manual';
  triggeredByUserId?: string | undefined;
}

export interface CapiTriggerResult {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  reason?: string | undefined;
  logId?: string | undefined;
}

export async function triggerCapiEvent(input: CapiTriggerInput): Promise<CapiTriggerResult> {
  const integration = await getIntegrationByOrgId(input.orgId);
  if (!integration || !integration.is_active) {
    return { status: 'SKIPPED', reason: 'No active Meta integration for this org' };
  }

  return withServiceTx(async (tx) => {
    // Get the marketing lead data (for PII fields)
    const leadResult = await tx.execute(
      sql`SELECT id, org_id, first_name, last_name, phone, email
          FROM crm.marketing_leads WHERE id = ${input.marketingLeadId} LIMIT 1`,
    );
    const lead = (leadResult as unknown as Array<{
      id: string; org_id: string; first_name: string | null;
      last_name: string | null; phone: string | null; email: string | null;
    }>)[0];
    if (!lead) return { status: 'SKIPPED' as const, reason: 'Marketing lead not found' };

    // Try to get linked meta_lead for richer data
    const metaResult = await tx.execute(
      sql`SELECT id, meta_lead_id::text as meta_lead_id, form_id::text as form_id,
                 email, phone, first_name, last_name, whatsapp_number
          FROM ext.meta_leads WHERE marketing_lead_id = ${input.marketingLeadId} LIMIT 1`,
    );
    const metaLead = (metaResult as unknown as Array<{
      id: string; meta_lead_id: string; form_id: string;
      email: string | null; phone: string | null; first_name: string | null;
      last_name: string | null; whatsapp_number: string | null;
    }>)[0];

    const eventName = input.eventName ?? 'Lead';

    // Check idempotency: has a successful event already been sent?
    const existingResult = await tx.execute(
      sql`SELECT id FROM ext.meta_capi_outbound_logs
          WHERE marketing_lead_id = ${input.marketingLeadId}
            AND event_name = ${eventName}
            AND delivery_status = 'SUCCESS'
          LIMIT 1`,
    );
    if ((existingResult as unknown as Array<{ id: string }>).length > 0) {
      return { status: 'SKIPPED' as const, reason: 'CAPI event already sent successfully for this lead+event' };
    }

    // Build CAPI payload using the best available data
    const piiFields = {
      email: metaLead?.email ?? lead.email,
      phone: metaLead?.phone ?? lead.phone,
      first_name: metaLead?.first_name ?? lead.first_name,
      last_name: metaLead?.last_name ?? lead.last_name,
      whatsapp_number: metaLead?.whatsapp_number ?? null,
    };

    const leadIdForEvent = metaLead?.meta_lead_id ?? input.marketingLeadId;
    const formId = metaLead?.form_id ?? 'unknown';

    const payload = buildCapiPayload({
      lead: piiFields,
      leadId: leadIdForEvent,
      formId,
      eventName,
      actionSource: input.actionSource ?? 'system_generated',
    });

    // Send to Meta CAPI
    const result = await sendCapiEvent(
      integration.pixel_id,
      integration.access_token,
      integration.graph_api_version,
      payload.apiBody,
    );

    // Log the result
    const logResult = await tx.execute(
      sql`INSERT INTO ext.meta_capi_outbound_logs (
            org_id, marketing_lead_id, meta_lead_id, event_name, event_id,
            delivery_status, fb_trace_id, request_payload, response_payload,
            triggered_by, triggered_by_user_id
          ) VALUES (
            ${input.orgId}, ${input.marketingLeadId}, ${metaLead?.id ?? null},
            ${eventName}, ${payload.eventId},
            ${result.status}, ${result.fbTraceId ?? null},
            ${JSON.stringify(payload.requestPayload)},
            ${result.metaResponse ? JSON.stringify(result.metaResponse) : null},
            ${input.triggeredBy}, ${input.triggeredByUserId ?? null}
          ) RETURNING id`,
    );
    const logId = (logResult as unknown as Array<{ id: string }>)[0]?.id;

    return { status: result.status, logId };
  });
}
