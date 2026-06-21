import type { RoleTxContext } from '@crm/db';
import * as repo from './branches.repository.js';
import type { LocationFilter } from './branches.repository.js';

export async function getBranches(ctx: RoleTxContext, filter: LocationFilter) {
  return repo.getBranches(ctx, filter);
}

export async function getAllBranches(ctx: RoleTxContext) {
  return repo.getAllBranches(ctx);
}

export async function getLeadSources() {
  return repo.getLeadSources();
}
