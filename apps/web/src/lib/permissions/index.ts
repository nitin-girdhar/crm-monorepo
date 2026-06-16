export { RANKS } from '@crm/permissions';
export { hasRole, hasMinimumRole, hasAnyRole } from '@crm/permissions';
export type { SessionUser, UserRole } from '@crm/types';

import { ROLE_RANK } from '@crm/auth-constants';
import type { SessionUser, UserRole } from '@crm/types';
import { RANKS } from '@crm/permissions';

export function canManageUsers(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  return user.rank >= RANKS.MANAGER;
}

export function canManageUsersView(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  return user.rank >= RANKS.SSE;
}

export function canCreateUser(actorRank: number, targetRank: number): boolean {
  if (actorRank < RANKS.MANAGER) return false;
  return actorRank > targetRank;
}

export function canViewUser(
  actor: SessionUser | null | undefined,
  target: { id: string; rank: number },
): boolean {
  if (!actor) return false;
  if (actor.rank >= RANKS.ADMIN) return true;
  if (target.id === actor.id) return true;
  if (target.rank >= RANKS.ADMIN) return false;
  if (actor.rank >= RANKS.MANAGER) return true;
  if (actor.rank === RANKS.SSE) return target.rank <= 20; // SE rank
  return false;
}

export function canAssignLeads(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  return user.rank >= RANKS.MANAGER;
}

export function canViewAnalytics(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  return user.rank >= RANKS.ADMIN;
}

// Re-export ROLE_RANK for callers that need the full map
export { ROLE_RANK };

// Alias for monolith-compat
export function hasMinimumRoleByName(
  user: SessionUser | null | undefined,
  min: UserRole,
): boolean {
  if (!user) return false;
  return user.rank >= ROLE_RANK[min];
}
