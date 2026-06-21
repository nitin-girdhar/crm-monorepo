export interface AssignmentView {
  id: string;
  lead_id: string;
  lead_full_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  lead_stage: string | null;
  lead_stage_label: string | null;
  lead_stage_outcome: string | null;
  lead_stage_outcome_label: string | null;
  lead_created_at: string;
  is_terminated: boolean;
  branch: string;
  org_id: string;
  assigned_to: string;
  assigned_rep_name: string | null;
  assigned_rep_email: string | null;
  assigned_rep_role: string | null;
  assigned_at: string;
  duplicate_lead_id: string | null;
}

export interface StatsData {
  total: number;
  lastUpdated: Date | null;
}

export interface UpdatePayload {
  leadId: string;
  field: 'stage' | 'comments';
  value: string;
  followUp?: {
    assignedUserId: string;
    scheduledAt: string;
    notes?: string | null;
  };
  outcomeId?: string;
  outcomeComment?: string;
  transitionNote?: string;
}

export interface StageOption {
  id: string;
  name: string;
  label: string;
  followup_required: boolean;
  is_rejected: boolean;
  is_terminated: boolean;
  sort_order: number;
}

export interface StageOutcome {
  id: string;
  name: string;
  label: string;
  stage_id: string;
  requires_comment: boolean;
  sort_order: number;
}
