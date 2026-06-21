import type { RoleTxContext } from '@crm/db';
import type { CreateLeadInput, UpdateLeadInput, CreateInteractionInput, CreateFollowUpInput } from '@crm/validation';
import { AppError, NotFoundError, ForbiddenError } from '../../../lib/errors.js';
import { logActivity } from '../../../lib/activity-logger.js';
import { fireCapiAutoTrigger } from '../../../lib/meta-capi-trigger.js';
import * as repo from './leads.repository.js';
import type { ListLeadsFilters, ListFollowUpsFilters } from './leads.repository.js';

export async function listLeads(ctx: RoleTxContext, filters: ListLeadsFilters) {
  return repo.listLeads(ctx, filters);
}

export async function getLeadById(ctx: RoleTxContext, leadId: string) {
  const lead = await repo.getLeadById(ctx, leadId);
  if (!lead) throw new NotFoundError('Lead not found');
  return lead;
}

export async function getLeadTimeline(ctx: RoleTxContext, leadId: string) {
  return repo.getLeadTimeline(ctx, leadId);
}

export async function getLeadInteractions(ctx: RoleTxContext, leadId: string) {
  return repo.getLeadInteractions(ctx, leadId);
}

export async function getLeadAssignmentHistory(ctx: RoleTxContext, leadId: string) {
  return repo.getLeadAssignmentHistory(ctx, leadId);
}

export async function getLeadFollowUps(ctx: RoleTxContext, leadId: string) {
  return repo.getLeadFollowUps(ctx, leadId);
}

export async function listFollowUps(ctx: RoleTxContext, filters: ListFollowUpsFilters) {
  return repo.listFollowUps(ctx, filters);
}

export async function getStageOptions() {
  return repo.getStageOptions();
}

export async function getStageOutcomes(stageId?: string) {
  return repo.getStageOutcomes(stageId);
}

export async function createLead(ctx: RoleTxContext, data: CreateLeadInput) {
  const result = await repo.createLead(ctx, data);
  await logActivity({ action_type: 'lead_created', performed_by: ctx.user_id, lead_id: result.id });
  return result;
}

export async function updateLead(ctx: RoleTxContext, leadId: string, data: UpdateLeadInput) {
  try {
    const result = await repo.updateLead(ctx, leadId, data);
    if (!result) throw new NotFoundError('Lead not found');

    if (data.stage_id) {
      await logActivity({
        action_type: 'status_change',
        performed_by: ctx.user_id,
        lead_id: leadId,
        new_value: { stage_id: data.stage_id, outcome_id: data.outcome_id },
      });

      fireCapiAutoTrigger(leadId, ctx.org_id, data.stage_id);
    }

    return result;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if ((err as Error).message.includes('hierarchy authority')) throw new ForbiddenError((err as Error).message);
    throw err;
  }
}

export async function deleteLead(ctx: RoleTxContext, leadId: string, comment: string) {
  await repo.deleteLead(ctx, leadId, comment);
  await logActivity({ action_type: 'lead_deleted', performed_by: ctx.user_id, lead_id: leadId });
}

export async function createInteraction(
  ctx: RoleTxContext,
  leadId: string,
  data: CreateInteractionInput,
) {
  const result = await repo.createInteraction(ctx, leadId, {
    ...(data.interaction_type !== undefined ? { interaction_type_name: data.interaction_type } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    ...(data.occurred_at !== undefined ? { occurred_at: data.occurred_at } : {}),
  });
  await logActivity({ action_type: 'interaction_created', performed_by: ctx.user_id, lead_id: leadId });
  return result;
}
