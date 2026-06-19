import type { SessionUser } from '@crm/types';

export function resolveActorOrgIds(actor: SessionUser): string[] | null {
  if (actor.role === 'super_admin' || actor.role === 'tenant_admin') return null;
  return [actor.org_id];
}
