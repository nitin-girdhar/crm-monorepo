import { RANKS } from './ranks.js';

export function canViewAllLeads(rank: number): boolean {
  return rank >= RANKS.SSE;
}

export function canEditLead(rank: number): boolean {
  return rank >= RANKS.SE;
}

export function canDeleteLead(rank: number): boolean {
  return rank >= RANKS.ADMIN;
}

export function canAssignLead(rank: number): boolean {
  return rank >= RANKS.SSE;
}
