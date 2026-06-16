export const ACTIVITY_ACTIONS = [
  'login_success',
  'login_failure',
  'logout',
  'user_created',
  'user_updated',
  'user_deactivated',
  'user_reactivated',
  'user_password_reset',
  'password_reset_by_admin',
  'password_changed_self',
  'role_changed',
  'privilege_denied_attempt',
  'assignment_created',
  'assignment_reassigned',
  'assignment_removed',
  'status_change',
  'lead_transferred',
  'sheet_assigned',
  'sheet_unassigned',
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export interface InsertActivityInput {
  action_type: ActivityAction | string;
  performed_by: string;
  subject_user_id?: string | null;
  lead_id?: string | null;
  old_value?: unknown;
  new_value?: unknown;
}
