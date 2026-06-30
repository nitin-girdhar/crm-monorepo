export interface DatabaseUser {
  id: string;
  org_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  full_name: string;
  email: string;
  mobile: string | null;
  password_hash: string | null;
  role_id: string;
  role_name: string;
  role_label: string;
  rank: number;
  manager_id: string | null;
  manager_name: string | null;
  last_login_at: Date | null;
  is_active: boolean;
  force_password_change: boolean;
  password_changed_at: Date | null;
  org_name: string;
  tenant_name: string;
  tenant_id: string;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
}

export interface Assignment {
  id: string;
  lead_id: string;
  branch: string;
  assigned_to: string;
  assigned_by: string;
  assigned_at: Date;
  notes: string | null;
  assigned_rep_name: string | null;
  assigned_rep_email: string | null;
}

export interface Activity {
  id: string;
  lead_id: string | null;
  action_type: string;
  old_value: unknown | null;
  new_value: unknown | null;
  performed_by: string;
  subject_user_id: string | null;
  created_at: Date;
}

export interface LeadView {
  lead_id: string;
  org_id: string;
  org_name: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  city: string | null;
  city_name: string | null;
  state_name: string | null;
  country_name: string | null;
  stage: string;
  stage_label: string;
  source: string | null;
  followup_required: boolean;
  is_rejected: boolean;
  is_terminated: boolean;
  outcome: string | null;
  outcome_label: string | null;
  outcome_comment: string | null;
  stage_id: string;
  outcome_id: string | null;
  campaign_name: string | null;
  platform: string | null;
  assigned_rep_name: string | null;
  assigned_rep_email: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
  assigned_user_id: string | null;
  campaign_id: string | null;
}
