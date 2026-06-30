import { sql, and, eq, asc } from 'drizzle-orm';
import { withRoleTx, withServiceTx } from '@crm/db';
import type { RoleTxContext } from '@crm/db';
import {
  leadStageTable,
  leadStageOutcomeTable,
  marketingLeadsTable,
  leadInteractionsTable,
  interactionTypesTable,
} from '@crm/db/schema';
import { RANKS } from '@crm/permissions';
import type { CreateLeadInput, UpdateLeadInput } from '@crm/validation';

function coerceTags(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') return val.split(',').map((t) => t.trim()).filter(Boolean);
  return [];
}

export interface ListLeadsFilters {
  status?: string;
  assigned_to?: string;
  assigned_user_id?: string;
  campaign_id?: string;
  search?: string;
  platforms?: string[];
  page: number;
  page_size: number;
  org_ids?: string[];
  actor_rank?: number;
  minRankToViewUnassigned: number;
}

export async function listLeads(ctx: RoleTxContext, filters: ListLeadsFilters) {
  return withRoleTx(ctx, async (tx) => {
    const { page, page_size } = filters;
    const offset = (page - 1) * page_size;
    const useMultiOrg = Boolean(filters.org_ids?.length);
    const assignedFilter = filters.assigned_user_id ?? filters.assigned_to;

    const where = and(
      sql`NOT is_deleted`,
      useMultiOrg ? sql`org_id = ANY(${filters.org_ids}::uuid[])` : undefined,
      (!useMultiOrg && filters.actor_rank !== undefined && filters.actor_rank < filters.minRankToViewUnassigned)
        ? sql`assigned_user_id = ${ctx.user_id}::uuid`
        : undefined,
      filters.status ? sql`stage = ${filters.status}` : undefined,
      assignedFilter ? sql`assigned_user_id = ${assignedFilter}::uuid` : undefined,
      filters.campaign_id ? sql`campaign_id = ${filters.campaign_id}::uuid` : undefined,
      filters.search ? sql`full_name ILIKE ${`%${filters.search}%`}` : undefined,
      filters.platforms?.length ? sql`platform = ANY(${filters.platforms}::text[])` : undefined,
    );

    const rows = (await tx.execute(sql`
      SELECT *, COUNT(*) OVER () AS total_count
      FROM crm.vw_dashboard_leads
      ${where ? sql`WHERE ${where}` : sql``}
      ORDER BY created_at DESC
      LIMIT ${page_size} OFFSET ${offset}
    `)) as Array<Record<string, unknown>>;

    const total = rows[0] ? Number(rows[0]['total_count'] ?? 0) : 0;

    const [stage_options, stage_outcomes] = await Promise.all([
      tx.select({
        id: leadStageTable.id,
        name: leadStageTable.name,
        label: leadStageTable.label,
        sort_order: leadStageTable.sortOrder,
        followup_required: leadStageTable.followupRequired,
        is_rejected: leadStageTable.isRejected,
        is_terminated: leadStageTable.isTerminated,
      }).from(leadStageTable).orderBy(asc(leadStageTable.sortOrder)),
      tx.select({
        id: leadStageOutcomeTable.id,
        name: leadStageOutcomeTable.name,
        label: leadStageOutcomeTable.label,
        stage_id: leadStageOutcomeTable.stageId,
        requires_comment: leadStageOutcomeTable.requiresComment,
        sort_order: leadStageOutcomeTable.sortOrder,
      }).from(leadStageOutcomeTable).orderBy(asc(leadStageOutcomeTable.sortOrder)),
    ]);

    return { leads: rows, total, page, page_size, stage_options, stage_outcomes };
  });
}

export async function getLeadById(ctx: RoleTxContext, leadId: string) {
  return withRoleTx(ctx, async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT ml.id, ml.org_id, ml.first_name, ml.middle_name, ml.last_name, ml.full_name,
             ml.phone, ml.email, ml.city, ml.address_line1, ml.address_line2, ml.pincode,
             ml.branch_id, ml.source_id, ml.campaign_id, ml.stage_id, ml.outcome_id,
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
             b.name          AS branch_name,
             src.name        AS source_name,
             ci.name         AS city_name,
             st.name         AS state_name,
             co.name         AS country_name
      FROM crm.marketing_leads ml
      JOIN crm.lead_stage ls ON ls.id = ml.stage_id
      LEFT JOIN crm.lead_stage_outcome lso ON lso.id = ml.outcome_id
      LEFT JOIN iam.users u ON u.id = ml.assigned_user_id
      LEFT JOIN entity.branches b ON b.id = ml.branch_id
      LEFT JOIN crm.lead_sources src ON src.id = ml.source_id
      LEFT JOIN geo.cities ci ON ci.id = ml.city_id
      LEFT JOIN geo.states st ON st.id = ml.state_id
      LEFT JOIN geo.countries co ON co.id = ml.country_id
      WHERE ml.id = ${leadId} AND ml.org_id = ${ctx.org_id} AND NOT ml.is_deleted
    `)) as Array<Record<string, unknown>>;
    return rows[0] ?? null;
  });
}

export async function getLeadTimeline(ctx: RoleTxContext, leadId: string) {
  return withRoleTx(ctx, async (tx) => {
    return (await tx.execute(sql`
      SELECT
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
      WHERE lead_id = ${leadId}
      ORDER BY event_at DESC
    `)) as Array<Record<string, unknown>>;
  });
}

export async function getLeadInteractions(ctx: RoleTxContext, leadId: string) {
  return withRoleTx(ctx, async (tx) => {
    return (await tx.execute(sql`
      SELECT li.*, u.full_name AS user_name, it.name AS interaction_type_name
      FROM crm.lead_interactions li
      JOIN iam.users u ON u.id = li.user_id
      LEFT JOIN crm.interaction_types it ON it.id = li.interaction_type_id
      WHERE li.lead_id = ${leadId} AND NOT li.is_deleted
      ORDER BY li.occurred_at DESC
    `)) as Array<Record<string, unknown>>;
  });
}

export async function getLeadAssignmentHistory(ctx: RoleTxContext, leadId: string) {
  return withRoleTx(ctx, async (tx) => {
    return (await tx.execute(sql`
      SELECT log_id, lead_id, lead_full_name,
             assigned_by_name, assigned_by_email,
             assigned_to_name, assigned_to_email,
             previous_assignee_name,
             action, note, assigned_at, held_for
      FROM crm.vw_lead_assignment_timeline
      WHERE lead_id = ${leadId}
      ORDER BY assigned_at DESC
    `)) as Array<Record<string, unknown>>;
  });
}

export async function getLeadFollowUps(ctx: RoleTxContext, leadId: string) {
  return withRoleTx(ctx, async (tx) => {
    return (await tx.execute(sql`
      SELECT lf.*, u.full_name AS assigned_user_name, fs.name AS status_name, fs.label AS status_label
      FROM crm.lead_follow_ups lf
      JOIN iam.users u ON u.id = lf.assigned_user_id
      JOIN crm.follow_up_statuses fs ON fs.id = lf.status_id
      WHERE lf.lead_id = ${leadId} AND NOT lf.is_deleted
      ORDER BY lf.scheduled_at DESC
    `)) as Array<Record<string, unknown>>;
  });
}

export interface ListFollowUpsFilters {
  assigned_rep_id?: string;
  overdue_only?: boolean;
}

export async function listFollowUps(ctx: RoleTxContext, filters: ListFollowUpsFilters) {
  return withRoleTx(ctx, async (tx) => {
    const where = and(
      sql`NOT lf.is_deleted`,
      sql`NOT ml.is_deleted`,
      sql`ml.org_id = ${ctx.org_id}::uuid`,
      sql`fs.name IN ('pending', 'missed')`,
      filters.assigned_rep_id ? sql`lf.assigned_user_id = ${filters.assigned_rep_id}::uuid` : undefined,
      filters.overdue_only ? sql`lf.scheduled_at < NOW()` : undefined,
    );

    return (await tx.execute(sql`
      SELECT
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
      ORDER BY lf.scheduled_at ASC
    `)) as Array<Record<string, unknown>>;
  });
}

export async function getStageOptions() {
  return withServiceTx(async (tx) => {
    return tx.select({
      id: leadStageTable.id,
      name: leadStageTable.name,
      label: leadStageTable.label,
      description: leadStageTable.description,
      sort_order: leadStageTable.sortOrder,
      followup_required: leadStageTable.followupRequired,
      is_rejected: leadStageTable.isRejected,
      is_terminated: leadStageTable.isTerminated,
    }).from(leadStageTable).orderBy(asc(leadStageTable.sortOrder));
  });
}

export async function getStageOutcomes(stageId?: string) {
  return withServiceTx(async (tx) => {
    const where = stageId ? eq(leadStageOutcomeTable.stageId, stageId) : undefined;
    return tx.select({
      id: leadStageOutcomeTable.id,
      name: leadStageOutcomeTable.name,
      label: leadStageOutcomeTable.label,
      description: leadStageOutcomeTable.description,
      stage_id: leadStageOutcomeTable.stageId,
      requires_comment: leadStageOutcomeTable.requiresComment,
      sort_order: leadStageOutcomeTable.sortOrder,
    }).from(leadStageOutcomeTable).where(where).orderBy(asc(leadStageOutcomeTable.sortOrder));
  });
}

export async function createLead(ctx: RoleTxContext, data: CreateLeadInput) {
  return withRoleTx(ctx, async (tx) => {
    const [defaultStage] = await tx
      .select({ id: leadStageTable.id })
      .from(leadStageTable)
      .where(eq(leadStageTable.name, 'new'))
      .limit(1);
    if (!defaultStage) throw new Error('Lead stage "new" not found');

    let duplicateLeadId: string | null = null;

    if (data.phone) {
      const [existing] = await tx
        .select({ id: marketingLeadsTable.id })
        .from(marketingLeadsTable)
        .where(and(
          eq(marketingLeadsTable.orgId, ctx.org_id),
          eq(marketingLeadsTable.phone, data.phone),
          eq(marketingLeadsTable.isDeleted, false),
        ))
        .orderBy(asc(marketingLeadsTable.createdAt))
        .limit(1);
      if (existing) duplicateLeadId = existing.id;
    }

    if (data.email && !duplicateLeadId) {
      const [existing] = await tx
        .select({ id: marketingLeadsTable.id })
        .from(marketingLeadsTable)
        .where(and(
          eq(marketingLeadsTable.orgId, ctx.org_id),
          eq(marketingLeadsTable.email, data.email),
          eq(marketingLeadsTable.isDeleted, false),
        ))
        .orderBy(asc(marketingLeadsTable.createdAt))
        .limit(1);
      if (existing) duplicateLeadId = existing.id;
    }

    const [inserted] = await tx
      .insert(marketingLeadsTable)
      .values({
        orgId: ctx.org_id,
        firstName: data.first_name,
        middleName: data.middle_name ?? null,
        lastName: data.last_name ?? '',
        phone: data.phone ?? null,
        email: data.email ?? null,
        city: data.city ?? null,
        addressLine1: data.address_line1 ?? null,
        addressLine2: data.address_line2 ?? null,
        pincode: data.pincode ?? null,
        branchId: data.branch_id ?? null,
        sourceId: data.source_id ?? null,
        campaignId: data.campaign_id ?? null,
        stageId: data.stage_id ?? defaultStage.id,
        assignedUserId: data.assigned_user_id ?? null,
        cityId: data.city_id ?? null,
        stateId: data.state_id ?? null,
        countryId: data.country_id ?? null,
        rawWebhookData: (data.raw_webhook_data ?? {}) as Record<string, unknown>,
        metadata: (data.metadata ?? {}) as Record<string, unknown>,
        tags: coerceTags(data.tags),
        createdBy: ctx.user_id,
      })
      .returning({ id: marketingLeadsTable.id });

    return { ...inserted!, duplicateLeadId };
  });
}

export async function updateLead(ctx: RoleTxContext, leadId: string, data: UpdateLeadInput) {
  return withRoleTx(ctx, async (tx) => {
    if (data.assigned_user_id !== undefined && data.assigned_user_id !== null) {
      const rows = (await tx.execute(sql`
        SELECT iam.can_assign_to(${ctx.org_id}::uuid, ${ctx.user_id}::uuid, ${data.assigned_user_id}::uuid) AS allowed
      `)) as Array<{ allowed: boolean }>;
      if (!rows[0]?.allowed) {
        throw new Error('Insufficient hierarchy authority to assign this lead');
      }
    }

    if (data.transition_note) {
      await tx.execute(sql`SELECT set_config('app.lead_transition_note', ${data.transition_note}, true)`);
    }

    const updateData: Record<string, unknown> = {};
    if (data.stage_id !== undefined)       updateData['stageId']       = data.stage_id;
    if (data.outcome_id !== undefined)     updateData['outcomeId']     = data.outcome_id;
    if (data.outcome_comment !== undefined) updateData['outcomeComment'] = data.outcome_comment;
    if (data.assigned_user_id !== undefined) updateData['assignedUserId'] = data.assigned_user_id;
    if (data.first_name !== undefined)     updateData['firstName']     = data.first_name;
    if (data.middle_name !== undefined)    updateData['middleName']    = data.middle_name;
    if (data.last_name !== undefined)      updateData['lastName']      = data.last_name;
    if (data.phone !== undefined)          updateData['phone']         = data.phone;
    if (data.email !== undefined)          updateData['email']         = data.email;
    if (data.city !== undefined)           updateData['city']          = data.city;
    if (data.city_id !== undefined)        updateData['cityId']        = data.city_id;
    if (data.state_id !== undefined)       updateData['stateId']       = data.state_id;
    if (data.country_id !== undefined)     updateData['countryId']     = data.country_id;
    if (data.address_line1 !== undefined)  updateData['addressLine1']  = data.address_line1;
    if (data.address_line2 !== undefined)  updateData['addressLine2']  = data.address_line2;
    if (data.pincode !== undefined)        updateData['pincode']       = data.pincode;
    if (data.branch_id !== undefined)      updateData['branchId']      = data.branch_id;
    if (data.source_id !== undefined)      updateData['sourceId']      = data.source_id;
    if (data.tags !== undefined)           updateData['tags']          = coerceTags(data.tags);
    if (data.metadata !== undefined)       updateData['metadata']      = data.metadata;

    if (Object.keys(updateData).length === 0) return null;

    const [updated] = await tx
      .update(marketingLeadsTable)
      .set(updateData as Parameters<typeof tx.update>[0] extends infer U ? Record<string, unknown> : never)
      .where(and(
        eq(marketingLeadsTable.id, leadId),
        eq(marketingLeadsTable.orgId, ctx.org_id),
        eq(marketingLeadsTable.isDeleted, false),
      ))
      .returning({ id: marketingLeadsTable.id, assignedUserId: marketingLeadsTable.assignedUserId });

    if (!updated) return null;

    if (data.note?.trim()) {
      await tx.insert(leadInteractionsTable).values({
        orgId: ctx.org_id,
        leadId,
        userId: ctx.user_id,
        notes: data.note.trim(),
      });
    }

    return updated;
  });
}

export async function deleteLead(ctx: RoleTxContext, leadId: string, comment: string) {
  return withRoleTx(ctx, async (tx) => {
    await tx.insert(leadInteractionsTable).values({
      orgId: ctx.org_id,
      leadId,
      userId: ctx.user_id,
      notes: `Deletion reason: ${comment}`,
    });
    await tx.execute(sql`
      UPDATE crm.marketing_leads
      SET is_deleted = TRUE, deleted_at = CLOCK_TIMESTAMP(), deleted_by = ${ctx.user_id}::uuid
      WHERE id = ${leadId} AND org_id = ${ctx.org_id}
    `);
  });
}

export async function createInteraction(
  ctx: RoleTxContext,
  leadId: string,
  data: { interaction_type_name?: string; notes?: string; occurred_at?: string },
) {
  return withRoleTx(ctx, async (tx) => {
    let interactionTypeId: string | null = null;

    if (data.interaction_type_name) {
      const [typeRow] = await tx
        .select({ id: interactionTypesTable.id })
        .from(interactionTypesTable)
        .where(eq(interactionTypesTable.name, data.interaction_type_name))
        .limit(1);
      interactionTypeId = typeRow?.id ?? null;
    }

    const [inserted] = await tx
      .insert(leadInteractionsTable)
      .values({
        orgId: ctx.org_id,
        leadId,
        userId: ctx.user_id,
        interactionTypeId,
        notes: data.notes ?? null,
        occurredAt: data.occurred_at ? new Date(data.occurred_at) : new Date(),
      })
      .returning({ id: leadInteractionsTable.id });

    return inserted!;
  });
}
