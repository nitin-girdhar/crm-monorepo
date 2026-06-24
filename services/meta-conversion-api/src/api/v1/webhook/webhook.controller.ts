import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AxiosError } from 'axios';
import { getIntegrationById } from '../../../services/integration.service.js';
import { fetchLeadFromMeta } from '../../../services/meta-api.service.js';
import { syncLeadToDatabase } from '../../../services/lead-sync.service.js';
import { verifyHmacSignature } from '../../../lib/hmac.js';
import { pgNotify } from '@crm/db';
import { config } from '../../../config/index.js';

const MetaWebhookBodySchema = z.object({
  object: z.literal('page'),
  entry: z.array(
    z.object({
      id: z.string(),
      time: z.number(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            leadgen_id: z.string(),
            page_id: z.string(),
            form_id: z.string().optional(),
            adgroup_id: z.string().optional(),
            ad_id: z.string().optional(),
            created_time: z.number().optional(),
          }),
        }),
      ),
    }),
  ),
});

export async function handleWebhookChallenge(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { integrationId } = request.params as { integrationId: string };
  const qs = request.query as Record<string, string>;

  const mode = qs['hub.mode'];
  const token = qs['hub.verify_token'];
  const challenge = qs['hub.challenge'];

  if (!mode || !token || !challenge) {
    return reply.status(400).send({ error: 'Missing hub.mode, hub.verify_token, or hub.challenge' });
  }

  const integration = await getIntegrationById(integrationId);
  if (!integration) {
    return reply.status(404).send({ error: 'Integration not found' });
  }

  if (mode === 'subscribe' && token === integration.verify_token) {
    return reply.status(200).send(challenge);
  }

  return reply.status(403).send({ error: 'Webhook verification failed' });
}

export async function handleWebhookPost(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { integrationId } = request.params as { integrationId: string };

  const integration = await getIntegrationById(integrationId);
  if (!integration) {
    return reply.status(404).send({ error: 'Integration not found' });
  }

  // HMAC verification
  const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    return reply.status(400).send({ error: 'Raw body unavailable for signature verification' });
  }

  const signatureHeader = request.headers['x-hub-signature-256'] as string | undefined;
  const hmacResult = verifyHmacSignature(
    rawBody,
    signatureHeader,
    integration.app_secret,
    config.nodeEnv === 'development',
  );

  if (!hmacResult.valid) {
    return reply.status(401).send({ error: hmacResult.error });
  }

  const body = MetaWebhookBodySchema.parse(hmacResult.parsedBody);
  const results: Array<{ leadId: string; status: string }> = [];

  for (const entry of body.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'leadgen') continue;

      const leadId = change.value.leadgen_id;

      try {
        const rawLead = await fetchLeadFromMeta(
          leadId,
          integration.access_token,
          integration.graph_api_version,
        );

        rawLead.field_data = rawLead.field_data ?? [];

        // Meta Graph API returns created_time as an ISO string; the
        // webhook change event carries it as a unix timestamp number.
        // Prefer the webhook value (already a number) and fall back to
        // parsing the Graph API string into epoch seconds.
        let createdTime: number | undefined = change.value.created_time;
        if (createdTime === undefined && rawLead.created_time) {
          const parsed = typeof rawLead.created_time === 'number'
            ? rawLead.created_time
            : Math.floor(new Date(rawLead.created_time).getTime() / 1000);
          if (!Number.isNaN(parsed)) createdTime = parsed;
        }

        const syncResult = await syncLeadToDatabase(integration.org_id, {
          id: rawLead.id,
          form_id: rawLead.form_id ?? change.value.form_id ?? 'unknown',
          page_id: change.value.page_id,
          ...(createdTime !== undefined ? { created_time: createdTime } : {}),
          ...(rawLead.ad_id !== undefined || change.value.ad_id !== undefined
            ? { ad_id: rawLead.ad_id ?? change.value.ad_id }
            : {}),
          ...(rawLead.adset_id !== undefined ? { adset_id: rawLead.adset_id } : {}),
          ...(rawLead.campaign_id !== undefined ? { campaign_id: rawLead.campaign_id } : {}),
          field_data: rawLead.field_data,
        });

        request.log.info(
          `Lead synced | metaLeadId=${leadId} marketingLeadId=${syncResult.marketingLeadId} duplicate=${syncResult.isDuplicate}`,
        );

        if (!syncResult.isDuplicate) {
          pgNotify('crm_events', {
            type: 'lead:created',
            lead_id: syncResult.marketingLeadId,
            org_id: integration.org_id,
            tenant_id: '',
            assigned_user_id: null,
            actor_id: 'system',
            ts: Date.now(),
          }).catch(() => {});
        }

        results.push({ leadId, status: syncResult.isDuplicate ? 'duplicate' : 'synced' });
      } catch (leadError) {
        const msg = leadError instanceof Error ? leadError.message : String(leadError);
        const metaErrorDetail = leadError instanceof AxiosError
          ? JSON.stringify(leadError.response?.data)
          : undefined;
        request.log.error(
          `Failed to sync leadId=${leadId} — ${msg}${metaErrorDetail ? ` | meta_response=${metaErrorDetail}` : ''}`,
        );
        results.push({ leadId, status: 'error' });
      }
    }
  }

  return reply.status(200).send({ received: true, processed: results.length, results });
}
