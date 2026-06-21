import { RANKS } from './ranks.js';

// ─── Tenant-level rule overrides ───────────────────────────────────────────
// Keys are tenant_id values. Any tenant not listed here gets DEFAULT_RULES.
// Add new per-tenant overrides by spreading DEFAULT_RULES and changing fields.

export interface TenantBusinessRules {
  // ── Lead visibility ─────────────────────────────────────────────────────
  // Minimum rank to see leads that have no assigned user.
  // Roles below this rank see only their own assigned leads.
  minRankToViewUnassignedLeads: number;

  // ── Navigation & dashboard ──────────────────────────────────────────────
  // Minimum rank to see the "Unassigned" stat card on the leads dashboard.
  minRankForUnassignedCard: number;

  // Minimum rank to access the Analytics page.
  minRankForAnalytics: number;

  // Minimum rank to manage (create/edit) users.
  minRankToManageUsers: number;

  // Minimum rank to view the Users page.
  minRankToViewUsers: number;

  // ── Assignments ─────────────────────────────────────────────────────────
  // Minimum rank to assign / reassign leads.
  minRankToAssignLeads: number;

  // Minimum rank to delete a lead.
  minRankToDeleteLead: number;

  // ── Leads History — "Assigned To" filter scope thresholds ───────────
  // Each threshold controls who the actor can filter by on the Leads History page.
  // Below the lowest threshold the filter is hidden and backend forces self.
  minRankForLeadsHistoryTeamScope: number;
  minRankForLeadsHistoryOrgScope: number;
  minRankForLeadsHistoryTenantScope: number;
  minRankForLeadsHistoryAllScope: number;
}

export type LeadsHistoryScope = 'none' | 'team' | 'org' | 'tenant' | 'all';

export const DEFAULT_RULES: TenantBusinessRules = {
  minRankToViewUnassignedLeads: RANKS.SSE,
  minRankForUnassignedCard:     RANKS.SSE,
  minRankForAnalytics:          RANKS.ADMIN,
  minRankToManageUsers:         RANKS.MANAGER,
  minRankToViewUsers:           RANKS.SSE,
  minRankToAssignLeads:         RANKS.SSE,
  minRankToDeleteLead:          RANKS.ADMIN,
  minRankForLeadsHistoryTeamScope:   RANKS.SSE,
  minRankForLeadsHistoryOrgScope:    RANKS.ADMIN,
  minRankForLeadsHistoryTenantScope: RANKS.TENANT_ADMIN,
  minRankForLeadsHistoryAllScope:    RANKS.SUPER_ADMIN,
};

// ── FitClass tenant: same as defaults (baseline)
const FITCLASS_TENANT_ID = 'a1000000-0000-0000-0000-000000000001';

const TENANT_OVERRIDES: Record<string, Partial<TenantBusinessRules>> = {
  [FITCLASS_TENANT_ID]: {
    // Below SSE cannot see unassigned leads at all
    minRankToViewUnassignedLeads: RANKS.SSE,
    minRankForUnassignedCard:     RANKS.SSE,
  },
};

export function getRulesForTenant(tenantId: string): TenantBusinessRules {
  const overrides = TENANT_OVERRIDES[tenantId];
  if (!overrides) return DEFAULT_RULES;
  return { ...DEFAULT_RULES, ...overrides };
}

// ── Convenience helpers (take tenant-resolved rules + actor rank) ────────

export function canViewUnassignedLeads(rules: TenantBusinessRules, rank: number): boolean {
  return rank >= rules.minRankToViewUnassignedLeads;
}

export function canSeeUnassignedCard(rules: TenantBusinessRules, rank: number): boolean {
  return rank >= rules.minRankForUnassignedCard;
}

export function checkAnalyticsAccess(rules: TenantBusinessRules, rank: number): boolean {
  return rank >= rules.minRankForAnalytics;
}

export function checkManageUsersAccess(rules: TenantBusinessRules, rank: number): boolean {
  return rank >= rules.minRankToManageUsers;
}

export function checkViewUsersAccess(rules: TenantBusinessRules, rank: number): boolean {
  return rank >= rules.minRankToViewUsers;
}

export function checkAssignLeadsAccess(rules: TenantBusinessRules, rank: number): boolean {
  return rank >= rules.minRankToAssignLeads;
}

export function checkDeleteLeadAccess(rules: TenantBusinessRules, rank: number): boolean {
  return rank >= rules.minRankToDeleteLead;
}

export function getLeadsHistoryAssignedToScope(rules: TenantBusinessRules, rank: number): LeadsHistoryScope {
  if (rank >= rules.minRankForLeadsHistoryAllScope) return 'all';
  if (rank >= rules.minRankForLeadsHistoryTenantScope) return 'tenant';
  if (rank >= rules.minRankForLeadsHistoryOrgScope) return 'org';
  if (rank >= rules.minRankForLeadsHistoryTeamScope) return 'team';
  return 'none';
}

export function canSeeAssignedToFilter(rules: TenantBusinessRules, rank: number): boolean {
  return rank >= rules.minRankForLeadsHistoryTeamScope;
}
