import type { LeadView } from '@crm/types';
import type { CardFilter } from '@/components/dashboard/LeadDashboardShell';

export const FILTER_STATUSES: Record<CardFilter, string[] | null> = {
  all:            null,
  new:            ['new'],
  callAttempted:  ['contacting'],
  unqualified:    ['unqualified'],
  visitScheduled: ['qualified'],
  converted:      ['converted'],
  followUp:       null,
  unassigned:     null,
};

export function applyLeadFilter(
  leads: readonly LeadView[],
  filter: CardFilter,
  followupRequiredStages?: string[],
): LeadView[] {
  if (filter === 'followUp') {
    const set = new Set(followupRequiredStages ?? []);
    return leads.filter((l) => set.has(l.stage ?? ''));
  }
  if (filter === 'unassigned') {
    return leads.filter((l) => !l.assigned_user_id);
  }
  const allowed = FILTER_STATUSES[filter];
  if (!allowed) return [...leads];
  const set = new Set(allowed);
  return leads.filter((l) => set.has(l.stage ?? ''));
}
