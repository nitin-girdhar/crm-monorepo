export function toAssignmentView(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id:                     String(row['id']),
    lead_id:                String(row['lead_id'] ?? ''),
    branch:                 String(row['branch'] ?? ''),
    assigned_to:            row['assigned_to'] ? String(row['assigned_to']) : null,
    assignee_name:          row['assigned_rep_name'] ? String(row['assigned_rep_name']) : null,
    assignee_email:         row['assigned_rep_email'] ? String(row['assigned_rep_email']) : null,
    assignee_role:          row['assigned_rep_role'] ? String(row['assigned_rep_role']) : null,
    lead_name:              row['lead_full_name'] ? String(row['lead_full_name']) : null,
    lead_phone:             row['lead_phone'] ? String(row['lead_phone']) : null,
    lead_email:             row['lead_email'] ? String(row['lead_email']) : null,
    lead_stage:             row['lead_stage'] ? String(row['lead_stage']) : null,
    org_id:                 String(row['org_id'] ?? ''),
    assigned_at:            row['assigned_at'] ? String(row['assigned_at']) : null,
    assigned_by:            null,
    notes:                  null,
    duplicate_lead_id:      null,
    duplicate_lead_platform: null,
  };
}
