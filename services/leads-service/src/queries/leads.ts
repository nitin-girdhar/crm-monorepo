import { withRoleTx, withServiceTx } from '@crm/db';
import type { Tx, SqlParams, RoleTxContext } from '@crm/db';
import { RANKS } from '@crm/permissions';

async function buildLeadsQuery(
  tx: Tx,
  org_id: string,
  user_id: string,
  filters: {
    status?: string | undefined;
    assigned_to?: string | undefined;
    assigned_user_id?: string | undefined;
    campaign_id?: string | undefined;
    search?: string | undefined;
    platforms?: string[] | undefined;
    page: number;
    page_size: number;
    org_ids?: string[] | undefined;
    actor_rank?: number | undefined;
    use_multi_org: boolean;
  },
) {
  const { page, page_size, use_multi_org } = filters;
  const offset = (page - 1) * page_size;
  const conditions: string[] = ['NOT is_deleted', 'is_active = true'];
  const params: unknown[] = [];

  if (use_multi_org) {
    params.push(filters.org_ids);
    conditions.push(`org_id = ANY($${params.length}::uuid[])`);
  }

  if (!use_multi_org && filters.actor_rank !== undefined && filters.actor_rank < RANKS.SSE) {
    params.push(user_id);
    conditions.push(`(assigned_user_id = $${params.length}::uuid OR assigned_user_id IS NULL)`);
  }

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`stage = $${params.length}`);
  }
  const assigned_filter = filters.assigned_user_id ?? filters.assigned_to;
  if (assigned_filter) {
    params.push(assigned_filter);
    conditions.push(`assigned_user_id = $${params.length}::uuid`);
  }
  if (filters.campaign_id) {
    params.push(filters.campaign_id);
    conditions.push(`campaign_id = $${params.length}::uuid`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`full_name ILIKE $${params.length}`);
  }
  if (filters.platforms && filters.platforms.length > 0) {
    params.push(filters.platforms);
    conditions.push(`platform = ANY($${params.length}::text[])`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const data_params: unknown[] = [...params, page_size, offset];

  const rows = await tx.unsafe(
    `SELECT *, COUNT(*) OVER () AS total_count
     FROM crm.vw_dashboard_leads
     ${where}
     ORDER BY created_at DESC
     LIMIT $${data_params.length - 1} OFFSET $${data_params.length}`,
    data_params as unknown as SqlParams,
  );

  const typed_rows = rows as Array<Record<string, unknown>>;
  const total = typed_rows[0] ? Number(typed_rows[0]['total_count'] ?? 0) : 0;

  const stage_options = await tx.unsafe(
    `SELECT id, name, label, sort_order, followup_required, is_rejected, is_terminated FROM crm.lead_stage ORDER BY sort_order`,
  );
  const stage_outcomes = await tx.unsafe(
    `SELECT id, name, label, stage_id, requires_comment, sort_order FROM crm.lead_stage_outcome ORDER BY sort_order`,
  );

  return { leads: typed_rows, total, stage_options, stage_outcomes, page, page_size };
}

export async function getLeads(
  org_id: string,
  user_id: string,
  filters: {
    status?: string | undefined;
    assigned_to?: string | undefined;
    assigned_user_id?: string | undefined;
    campaign_id?: string | undefined;
    search?: string | undefined;
    platforms?: string[] | undefined;
    page?: number | undefined;
    page_size?: number | undefined;
    org_ids?: string[] | undefined;
    actor_rank?: number | undefined;
    role?: string | undefined;
    tenant_id?: string | undefined;
  } = {},
) {
  const page = filters.page ?? 1;
  const page_size = Math.min(filters.page_size ?? 50, 500);
  const use_multi_org = Boolean(filters.org_ids && filters.org_ids.length > 0);
  const resolved = { ...filters, page, page_size, use_multi_org };

  const ctx: RoleTxContext = {
    role: filters.role ?? 'org_admin',
    org_id,
    tenant_id: filters.tenant_id ?? '',
    user_id,
  };
  return withRoleTx(ctx, (tx) => buildLeadsQuery(tx, org_id, user_id, resolved));
}

export async function getLeadById(
  org_id: string,
  user_id: string,
  lead_id: string,
  role = 'org_admin',
  tenant_id = '',
) {
  return withRoleTx({ role, org_id, tenant_id, user_id }, async (tx) => {
    const rows = await tx.unsafe(
      `SELECT ml.id, ml.org_id, ml.first_name, ml.middle_name, ml.last_name, ml.full_name,
              ml.phone, ml.email, ml.city, ml.address_line1, ml.address_line2, ml.pincode,
              ml.source_id, ml.campaign_id, ml.stage_id, ml.outcome_id,
              ml.outcome_comment, ml.assigned_user_id, ml.city_id, ml.state_id, ml.country_id,
              ml.tags, ml.metadata, ml.is_active, ml.superseded_by,
              ml.created_at, ml.updated_at, ml.created_by,
              ls.name         AS stage_name,
              ls.label        AS stage_label,
              ls.followup_required,
              ls.is_rejected,
              ls.is_terminated,
              lso.name        AS outcome_name,
              lso.label       AS outcome_label,
              lso.requires_comment,
              u.full_name     AS assigned_rep_name,
              u.email         AS assigned_rep_email,
              src.name        AS source_name,
              ci.name         AS city_name,
              st.name         AS state_name,
              co.name         AS country_name
       FROM crm.marketing_leads ml
       JOIN crm.lead_stage ls ON ls.id = ml.stage_id
       LEFT JOIN crm.lead_stage_outcome lso ON lso.id = ml.outcome_id
       LEFT JOIN iam.users u ON u.id = ml.assigned_user_id
       LEFT JOIN crm.lead_sources src ON src.id = ml.source_id
       LEFT JOIN geo.cities ci ON ci.id = ml.city_id
       LEFT JOIN geo.states st ON st.id = ml.state_id
       LEFT JOIN geo.countries co ON co.id = ml.country_id
       WHERE ml.id = $1 AND ml.org_id = $2 AND NOT ml.is_deleted`,
      [lead_id, org_id],
    );
    return (rows as Array<Record<string, unknown>>)[0] ?? null;
  });
}

export async function getLeadTimeline(
  org_id: string,
  user_id: string,
  lead_id: string,
  role = 'org_admin',
  tenant_id = '',
) {
  return withRoleTx({ role, org_id, tenant_id, user_id }, async (tx) => {
    return tx.unsafe(
      `SELECT
         event_id          AS "eventId",
         org_id            AS "orgId",
         lead_id           AS "leadId",
         event_type        AS "eventType",
         event_at          AS "eventAt",
         actor_name        AS "actorName",
         actor_email       AS "actorEmail",
         old_stage         AS "oldStage",
         old_stage_label   AS "oldStageLabel",
         new_stage         AS "newStage",
         new_stage_label   AS "newStageLabel",
         old_outcome       AS "oldOutcome",
         old_outcome_label AS "oldOutcomeLabel",
         new_outcome       AS "newOutcome",
         new_outcome_label AS "newOutcomeLabel",
         assigned_to_name  AS "assignedToName",
         note,
         followup_id       AS "followupId",
         followup_status   AS "followupStatus",
         scheduled_at      AS "scheduledAt",
         completed_at      AS "completedAt",
         interaction_type  AS "interactionType"
       FROM crm.vw_lead_followup_timeline
       WHERE lead_id = $1
       ORDER BY event_at DESC`,
      [lead_id],
    );
  });
}

export async function getLeadInteractions(
  org_id: string,
  user_id: string,
  lead_id: string,
  role = 'org_admin',
  tenant_id = '',
) {
  return withRoleTx({ role, org_id, tenant_id, user_id }, async (tx) => {
    return tx.unsafe(
      `SELECT li.*, u.full_name AS user_name, it.name AS interaction_type_name
       FROM crm.lead_interactions li
       JOIN iam.users u ON u.id = li.user_id
       LEFT JOIN crm.interaction_types it ON it.id = li.interaction_type_id
       WHERE li.lead_id = $1 AND NOT li.is_deleted
       ORDER BY li.occurred_at DESC`,
      [lead_id],
    );
  });
}

export async function getLeadAssignmentHistory(
  org_id: string,
  user_id: string,
  lead_id: string,
  role = 'org_admin',
  tenant_id = '',
) {
  return withRoleTx({ role, org_id, tenant_id, user_id }, async (tx) => {
    return tx.unsafe(
      `SELECT log_id, lead_id, lead_full_name,
              assigned_by_name, assigned_by_email,
              assigned_to_name, assigned_to_email,
              previous_assignee_name,
              action, note, assigned_at, held_for
       FROM crm.vw_lead_assignment_timeline
       WHERE lead_id = $1
       ORDER BY assigned_at DESC`,
      [lead_id],
    );
  });
}

export async function getLeadFollowUps(
  org_id: string,
  user_id: string,
  lead_id: string,
  role = 'org_admin',
  tenant_id = '',
) {
  return withRoleTx({ role, org_id, tenant_id, user_id }, async (tx) => {
    return tx.unsafe(
      `SELECT lf.*, u.full_name AS assigned_user_name, fs.name AS status_name, fs.label AS status_label
       FROM crm.lead_follow_ups lf
       JOIN iam.users u ON u.id = lf.assigned_user_id
       JOIN crm.follow_up_statuses fs ON fs.id = lf.status_id
       WHERE lf.lead_id = $1 AND NOT lf.is_deleted
       ORDER BY lf.scheduled_at DESC`,
      [lead_id],
    );
  });
}

export async function listFollowUps(
  org_id: string,
  user_id: string,
  filters: {
    assigned_rep_id?: string | undefined;
    overdue_only?: boolean | undefined;
    role?: string | undefined;
    tenant_id?: string | undefined;
  },
) {
  return withRoleTx({ role: filters.role ?? 'org_admin', org_id, tenant_id: filters.tenant_id ?? '', user_id }, async (tx) => {
    const conditions: string[] = [
      'NOT lf.is_deleted',
      'NOT ml.is_deleted',
      `ml.org_id = $1::uuid`,
      `fs.name IN ('pending', 'missed')`,
    ];
    const params: unknown[] = [org_id];

    if (filters.assigned_rep_id) {
      params.push(filters.assigned_rep_id);
      conditions.push(`lf.assigned_user_id = $${params.length}::uuid`);
    }
    if (filters.overdue_only) {
      conditions.push(`lf.scheduled_at < NOW()`);
    }

    const where = conditions.join(' AND ');

    const rows = await tx.unsafe(
      `SELECT
         lf.id                                                               AS "followUpId",
         lf.lead_id                                                          AS "leadId",
         ml.full_name                                                        AS "leadFullName",
         ml.phone                                                            AS "leadPhone",
         lstg.name                                                           AS "leadStage",
         u.full_name                                                         AS "assignedRepName",
         u.email                                                             AS "assignedRepEmail",
         (lf.scheduled_at < NOW())::boolean                                  AS "isOverdue",
         CASE WHEN lf.scheduled_at < NOW()
              THEN (EXTRACT(EPOCH FROM (NOW() - lf.scheduled_at)) / 60)::int
              ELSE NULL END                                                  AS "minutesOverdue",
         fs.name                                                             AS "followUpStatus",
         lf.scheduled_at                                                     AS "scheduledAt",
         li.created_at                                                       AS "lastInteractionAt",
         it.name                                                             AS "lastInteractionType",
         lf.notes                                                            AS "notes"
       FROM crm.lead_follow_ups lf
       JOIN crm.marketing_leads ml ON ml.id = lf.lead_id
       JOIN crm.lead_stage lstg ON lstg.id = ml.stage_id
       JOIN iam.users u ON u.id = lf.assigned_user_id
       JOIN crm.follow_up_statuses fs ON fs.id = lf.status_id
       LEFT JOIN LATERAL (
         SELECT li2.created_at, li2.interaction_type_id
         FROM crm.lead_interactions li2
         WHERE li2.lead_id = lf.lead_id
         ORDER BY li2.created_at DESC
         LIMIT 1
       ) li ON true
       LEFT JOIN crm.interaction_types it ON it.id = li.interaction_type_id
       WHERE ${where}
       ORDER BY lf.scheduled_at ASC`,
      params as unknown as SqlParams,
    );
    return rows as Array<Record<string, unknown>>;
  });
}

export async function getStageOptions() {
  return withServiceTx(async (tx) => {
    return tx.unsafe(
      `SELECT id, name, label, description, sort_order, followup_required, is_rejected, is_terminated
       FROM crm.lead_stage ORDER BY sort_order`,
    );
  });
}

export async function getStageOutcomes(stage_id?: string) {
  return withServiceTx(async (tx) => {
    if (stage_id !== undefined) {
      return tx.unsafe(
        `SELECT id, name, label, description, stage_id, requires_comment, sort_order
         FROM crm.lead_stage_outcome WHERE stage_id = $1 ORDER BY sort_order`,
        [stage_id],
      );
    }
    return tx.unsafe(
      `SELECT id, name, label, description, stage_id, requires_comment, sort_order
       FROM crm.lead_stage_outcome ORDER BY sort_order`,
    );
  });
}
