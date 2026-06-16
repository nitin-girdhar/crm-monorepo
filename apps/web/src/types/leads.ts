export interface AssignmentView {
  id: string;
  lead_id: string;
  lead_name: string | null;
  lead_phone: string | null;
  branch: string;
  assigned_to: string;
  assigned_by: string;
  assigned_at: string;
  notes: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  assignee_role: string | null;
  duplicate_lead_id: string | null;
  duplicate_lead_platform: string | null;
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
