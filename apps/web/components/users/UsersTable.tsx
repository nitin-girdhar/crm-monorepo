'use client';

import { useCallback, useMemo, useState } from 'react';
import type { SessionUser } from '@crm/types';
import { ROLES, ROLE_LABELS, ROLE_RANK } from '@crm/auth-constants';
import { canCreateUser } from '@/src/lib/permissions';

import UserStatusBadge from './UserStatusBadge';
import DownloadButton from '@/components/common/DownloadButton';
import {
  buildFilename,
  exportRows,
  type ExportColumn,
  type ExportFormat,
} from '@/src/lib/export/export';

const USER_EXPORT_COLUMNS: ExportColumn<SessionUser>[] = [
  { header: 'Name', value: (u) => u.name ?? '' },
  { header: 'Role', value: (u) => u.role_label ?? ROLE_LABELS[u.role] ?? '' },
  { header: 'Email', value: (u) => u.email },
  { header: 'Org', value: (u) => u.org_name ?? '' },
  { header: 'Manager', value: (u) => u.manager_name ?? '' },
  { header: 'Status', value: (u) => (u.is_active ? 'Active' : 'Inactive') },
  { header: 'Last Login', value: (u) => u.last_login_at ?? '' },
];

interface Props {
  users: SessionUser[];
  currentUserId: string;
  actorRank: number;
  onEdit: (user: SessionUser) => void;
}

type StatusFilter = 'all' | 'active' | 'inactive';
type RoleFilter = 'all' | SessionUser['role'];

export default function UsersTable({ users, currentUserId, actorRank, onEdit }: Props) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const canEditRow = useCallback(
    (u: SessionUser) => canCreateUser(actorRank, u.rank),
    [actorRank],
  );

  const userById = useMemo(() => {
    const map = new Map<string, SessionUser>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter === 'active' && !u.is_active) return false;
      if (statusFilter === 'inactive' && u.is_active) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (q) {
        const hay = `${u.email} ${u.name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  const exportUsers = (format: ExportFormat) => {
    exportRows(filtered, USER_EXPORT_COLUMNS, buildFilename(['users']), format);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#F1F5F9] p-3 sm:p-4">
        <input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm text-[#0F172A] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5 text-xs font-semibold text-[#475569] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20"
        >
          <option value="all">All roles</option>
          {ROLES.filter((r) => canCreateUser(actorRank, ROLE_RANK[r] ?? 0)).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5 text-xs font-semibold text-[#475569] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20"
        >
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
        <span className="ml-auto text-xs text-[#64748B]">
          {filtered.length} of {users.length}
        </span>
        <DownloadButton onExport={exportUsers} rowCount={filtered.length} />
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-[#F8FAFC] text-left text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Org</th>
              <th className="px-4 py-2.5">Manager</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {filtered.map((u) => (
              <tr key={u.id} className="text-[#0F172A]">
                <td className="px-4 py-2.5">
                  <div>
                    <span>
                      {u.name ?? '—'}
                      {u.id === currentUserId && (
                        <span className="ml-2 text-[10px] font-semibold uppercase text-[#0b6cbf]">
                          (you)
                        </span>
                      )}
                    </span>
                    {u.role_label && (
                      <span className="block text-[10px] text-[#94A3B8]">{u.role_label}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-[#475569]">{u.email}</td>
                <td className="px-4 py-2.5 text-xs text-[#475569]">{u.org_name || '—'}</td>
                <td className="px-4 py-2.5 text-xs text-[#475569]">
                  {u.manager_id ? (
                    <div>
                      <span>{u.manager_name ?? '—'}</span>
                      {userById.get(u.manager_id)?.role_label && (
                        <span className="block text-[10px] text-[#94A3B8]">{userById.get(u.manager_id)!.role_label}</span>
                      )}
                    </div>
                  ) : (
                    <span className="italic text-[#94A3B8]">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5"><UserStatusBadge active={u.is_active} /></td>
                <td className="px-4 py-2.5 text-right">
                  {canEditRow(u) ? (
                    <button
                      type="button"
                      onClick={() => onEdit(u)}
                      className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]"
                    >
                      Edit
                    </button>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide text-[#94A3B8]">
                      View only
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-[#64748B]">
                  No users match the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-[#F1F5F9] md:hidden">
        {filtered.map((u) => (
          <li key={u.id} className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#0F172A]">
                  {u.name ?? '—'}
                  {u.id === currentUserId && (
                    <span className="ml-2 text-[10px] font-semibold uppercase text-[#0b6cbf]">(you)</span>
                  )}
                </p>
                {u.role_label && (
                  <p className="text-[10px] text-[#94A3B8]">{u.role_label}</p>
                )}
                <p className="truncate text-xs text-[#475569]">{u.email}</p>
              </div>
              {canEditRow(u) ? (
                <button
                  type="button"
                  onClick={() => onEdit(u)}
                  className="shrink-0 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1 text-xs font-semibold text-[#475569]"
                >
                  Edit
                </button>
              ) : (
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-[#94A3B8]">
                  View only
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <UserStatusBadge active={u.is_active} />
              {u.manager_name ? (
                <span className="text-[11px] text-[#475569]">↑ {u.manager_name}</span>
              ) : (
                <span className="text-[11px] italic text-[#94A3B8]">No manager</span>
              )}
            </div>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-8 text-center text-xs text-[#64748B]">
            No users match the filters.
          </li>
        )}
      </ul>
    </div>
  );
}
