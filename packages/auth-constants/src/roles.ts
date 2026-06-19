export const ROLES = [
  'read_only',
  'sales_representative',
  'senior_sales_executive',
  'org_manager',
  'org_sr_manager',
  'org_admin',
  'tenant_admin',
  'super_admin',
] as const;

export type UserRole = (typeof ROLES)[number];

export const ROLE_RANK: Record<UserRole, number> = {
  read_only: 0,
  sales_representative: 20,
  senior_sales_executive: 40,
  org_manager: 60,
  org_sr_manager: 70,
  org_admin: 80,
  tenant_admin: 90,
  super_admin: 100,
};

export const ROLE_LABELS: Record<UserRole, string> = {
  read_only: 'Read Only',
  sales_representative: 'Sales Representative',
  senior_sales_executive: 'Senior Sales Executive',
  org_manager: 'Manager',
  org_sr_manager: 'Senior Manager',
  org_admin: 'Admin',
  tenant_admin: 'Tenant Admin',
  super_admin: 'Super Admin',
};

export const ROLE_TIERS = {
  ADMIN: ['super_admin', 'tenant_admin', 'org_admin'] as const,
  MANAGER: ['org_sr_manager', 'org_manager'] as const,
  SSE: ['senior_sales_executive'] as const,
  SE: ['sales_representative'] as const,
  READ_ONLY: ['read_only'] as const,
} satisfies Record<string, readonly UserRole[]>;

export const AUTH_ROUTES = {
  login: '/login',
  dashboard: '/dashboard/leads',
} as const;

// Maps each application role to the PostgreSQL role that enforces the correct
// RLS scope.  Used by withRoleTx() in @crm/db to select the right connection
// pool and SET LOCAL ROLE statement.
export const APP_ROLE_TO_PG_ROLE = {
  read_only:               'app_user',
  sales_representative:    'app_user',
  senior_sales_executive:  'app_user',
  org_manager:             'app_user',
  org_sr_manager:          'app_user',
  org_admin:               'app_user',
  tenant_admin:            'tenant_admin',
  super_admin:             'crm_service',
} as const satisfies Record<UserRole, 'app_user' | 'tenant_admin' | 'crm_service'>;
