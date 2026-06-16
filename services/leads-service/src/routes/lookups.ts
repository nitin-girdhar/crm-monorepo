import type { FastifyInstance } from 'fastify';
import { withServiceTx } from '@crm/db';
import { config } from '../config.js';

export async function lookupsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/lookups', async (_request, reply) => {
    const [sources, platforms, interaction_types, stages, campaign_statuses] = await withServiceTx(async (tx) => {
      return Promise.all([
        tx.unsafe(`SELECT id, name FROM lead_sources ORDER BY name`),
        tx.unsafe(`SELECT id, name, description FROM marketing_platforms ORDER BY name`),
        tx.unsafe(`SELECT id, name, description FROM interaction_types ORDER BY name`),
        tx.unsafe(`SELECT id, name, label, description, sort_order, followup_required, is_rejected, is_terminated FROM lead_stage ORDER BY sort_order`),
        tx.unsafe(`SELECT id, name, description FROM campaign_statuses ORDER BY name`),
      ]);
    });
    return reply.status(200).send({ sources, platforms, interaction_types, stages, campaign_statuses });
  });

  app.get('/lookups/cities', async (request, reply) => {
    const qs = request.query as Record<string, string>;
    const state_id = qs['state_id'] ? parseInt(qs['state_id'], 10) : undefined;
    const cities = await withServiceTx(async (tx) => {
      if (state_id !== undefined) {
        return tx.unsafe(
          `SELECT id, name FROM cities WHERE state_id = $1 ORDER BY name`,
          [state_id],
        );
      }
      return tx.unsafe(`SELECT id, name, state_id FROM cities ORDER BY name LIMIT 500`);
    });
    return reply.status(200).send(cities);
  });

  // Geographic lookup: countries → states → cities
  // Supports ?level=countries|states|cities with optional countryIds=1,2 / stateIds=3,4
  app.get('/locations', async (request, reply) => {
    const qs = request.query as Record<string, string>;
    const level = qs['level'];

    const countryIds = qs['countryIds']
      ? qs['countryIds'].split(',').map(Number).filter(Boolean)
      : qs['country_id'] ? [parseInt(qs['country_id'], 10)] : [];
    const stateIds = qs['stateIds']
      ? qs['stateIds'].split(',').map(Number).filter(Boolean)
      : qs['state_id'] ? [parseInt(qs['state_id'], 10)] : [];

    const data = await withServiceTx(async (tx) => {
      if (level === 'states') {
        if (countryIds.length) {
          return tx.unsafe(
            `SELECT id, name, code AS "isoCode", country_id AS "countryId" FROM states WHERE country_id = ANY($1::int[]) ORDER BY name`,
            [countryIds],
          );
        }
        return tx.unsafe(`SELECT id, name, code AS "isoCode", country_id AS "countryId" FROM states ORDER BY name`);
      }
      if (level === 'cities') {
        if (stateIds.length) {
          return tx.unsafe(
            `SELECT id, name, state_id AS "stateId" FROM cities WHERE state_id = ANY($1::int[]) ORDER BY name`,
            [stateIds],
          );
        }
        return tx.unsafe(`SELECT id, name, state_id AS "stateId" FROM cities ORDER BY name LIMIT 500`);
      }
      // Default: return countries list
      return tx.unsafe(`SELECT id, name, iso_code AS "isoCode" FROM countries ORDER BY name`);
    });

    return reply.status(200).send(data);
  });

  // Webhook intake for Zapier / Facebook Lead Ads
  app.post('/intake/webhook', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const org_id = String(body['org_id'] ?? '');
    if (!org_id) return reply.status(400).send({ error: 'org_id is required' });

    const result = await withServiceTx(async (tx) => {
      const stage_rows = await tx.unsafe(
        `SELECT id FROM lead_stage WHERE name = 'new' LIMIT 1`,
      );
      const stage_row = (stage_rows as unknown as Array<{ id: string }>)[0];
      if (!stage_row) throw new Error('Lead stage "new" not found');

      // Resolve source by name if provided
      let source_id: string | null = null;
      if (body['source']) {
        const src_rows = await tx.unsafe(
          `SELECT id FROM lead_sources WHERE name = $1 LIMIT 1`,
          [String(body['source'])],
        );
        source_id = (src_rows as unknown as Array<{ id: string }>)[0]?.id ?? null;
      }

      // Resolve campaign by id if provided
      const campaign_id = body['campaign_id'] ? String(body['campaign_id']) : null;

      const rows = await tx.unsafe(
        `INSERT INTO marketing_leads
           (org_id, first_name, last_name, phone, email, city, stage_id, source_id, campaign_id, raw_webhook_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
         RETURNING id`,
        [
          org_id,
          (body['first_name'] ?? null) as string | null,
          (body['last_name'] ?? null) as string | null,
          (body['phone'] ?? null) as string | null,
          (body['email'] ?? null) as string | null,
          (body['city'] ?? null) as string | null,
          stage_row.id,
          source_id,
          campaign_id,
          JSON.stringify(body),
        ],
      );
      return (rows as unknown as Array<{ id: string }>)[0]!;
    });

    return reply.status(201).send({ id: result.id });
  });

  // Cron: mark overdue pending follow-ups as missed
  app.post('/cron/mark-missed-followups', async (request, reply) => {
    const secret = request.headers['x-cron-secret'];
    if (!config.cronSecret || secret !== config.cronSecret) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const result = await withServiceTx(async (tx) => {
      const missed_status_rows = await tx.unsafe(
        `SELECT id FROM follow_up_statuses WHERE name = 'missed' LIMIT 1`,
      );
      const missed_id = (missed_status_rows as unknown as Array<{ id: string }>)[0]?.id;
      if (!missed_id) throw new Error('follow_up_statuses: missed not found');

      const pending_status_rows = await tx.unsafe(
        `SELECT id FROM follow_up_statuses WHERE name = 'pending' LIMIT 1`,
      );
      const pending_id = (pending_status_rows as unknown as Array<{ id: string }>)[0]?.id;
      if (!pending_id) throw new Error('follow_up_statuses: pending not found');

      const rows = await tx.unsafe(
        `UPDATE lead_follow_ups
         SET status_id = $1, updated_at = CLOCK_TIMESTAMP()
         WHERE status_id = $2
           AND scheduled_at < CLOCK_TIMESTAMP()
           AND NOT is_deleted
         RETURNING id`,
        [missed_id, pending_id],
      );
      return (rows as unknown as Array<{ id: string }>).length;
    });

    return reply.status(200).send({ marked_missed: result });
  });
}
