import type { RoleTxContext } from '@crm/db';
import * as repo from './orgs.repository.js';
import type { LocationFilter } from './orgs.repository.js';

export async function getOrgs(ctx: RoleTxContext, filter: LocationFilter) {
  return repo.getOrgs(ctx, filter);
}

export async function getAllOrgs(ctx: RoleTxContext) {
  return repo.getAllOrgs(ctx);
}

export async function getLeadSources() {
  return repo.getLeadSources();
}
