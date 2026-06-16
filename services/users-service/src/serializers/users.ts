export function toUserView(row: Record<string, unknown>): Record<string, unknown> {
  const firstName  = String(row['first_name'] ?? '');
  const middleName = row['middle_name'] ? String(row['middle_name']) : null;
  const lastName   = String(row['last_name'] ?? '');
  const fullName   = String(row['full_name'] ?? '') || [firstName, middleName, lastName].filter(Boolean).join(' ');

  return {
    id:                     String(row['id']),
    org_id:                 String(row['org_id'] ?? ''),
    org_name:               String(row['org_name'] ?? ''),
    tenant_name:            String(row['tenant_name'] ?? ''),
    first_name:             firstName,
    middle_name:            middleName,
    last_name:              lastName,
    name:                   fullName,
    email:                  String(row['email'] ?? ''),
    mobile:                 row['mobile'] ? String(row['mobile']) : null,
    role:                   String(row['role_name'] ?? ''),
    role_label:             String(row['role_label'] ?? ''),
    rank:                   Number(row['rank'] ?? 0),
    is_active:              Boolean(row['is_active']),
    force_password_change:  Boolean(row['force_password_change']),
    last_login_at:          row['last_login_at'] ? String(row['last_login_at']) : null,
    manager_id:             row['manager_id'] ? String(row['manager_id']) : null,
    manager_name:           row['manager_name'] ? String(row['manager_name']) : null,
    assigned_leads_count:   Number(row['assigned_leads_count'] ?? 0),
    created_at:             String(row['created_at'] ?? ''),
    updated_at:             String(row['updated_at'] ?? ''),
  };
}
