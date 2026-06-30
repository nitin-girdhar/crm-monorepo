'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionUser, LeadView } from '@crm/types';
import { getRulesForTenant, canSeeAssignedToFilter, getLeadsHistoryAssignedToScope } from '@crm/permissions';
import type { AssignmentView, StageOption, StageOutcome } from '@/src/types/leads';
import { useLeadsHistory } from '@/hooks/useLeadsHistory';
import type { LeadsHistoryFilters } from '@/hooks/useLeadsHistory';
import { users as usersApi, orgs as orgsApi } from '@/src/lib/api/client';
import Pagination from '@/components/common/Pagination';
import DownloadButton from '@/components/common/DownloadButton';
import AssigneeBadge from '@/components/assignments/AssigneeBadge';
import { LeadHistoryModal } from '@/components/LeadHistoryModal';
import { buildFilename, exportRows, type ExportColumn, type ExportFormat } from '@/src/lib/export/export';

interface Props {
  actor: SessionUser;
}

interface UserOption { id: string; label: string }
interface OrgOption { id: string; name: string }

function defaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}
function today(): string {
  return new Date().toISOString().split('T')[0];
}
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const EXPORT_COLUMNS: ExportColumn<AssignmentView>[] = [
  { header: 'Name', value: (a) => a.lead_full_name ?? '' },
  { header: 'Phone', value: (a) => a.lead_phone ?? '' },
  { header: 'Branch', value: (a) => a.branch },
  { header: 'Stage', value: (a) => a.lead_stage_label ?? a.lead_stage ?? '' },
  { header: 'Outcome', value: (a) => a.lead_stage_outcome_label ?? '' },
  { header: 'Assigned To', value: (a) => a.assigned_rep_name ?? '' },
  { header: 'Created', value: (a) => formatDate(a.lead_created_at) },
];

const ACTIVE_STAGE_NAMES = new Set(['new', 'contacting', 'qualified']);


export default function LeadsHistoryShell({ actor }: Props) {
  const rules = useMemo(() => getRulesForTenant(actor.tenant_id), [actor.tenant_id]);
  const showAssignedTo = canSeeAssignedToFilter(rules, actor.rank);
  const scope = getLeadsHistoryAssignedToScope(rules, actor.rank);

  const [historyLead, setHistoryLead] = useState<AssignmentView | null>(null);

  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(today);
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [selectedOutcomes, setSelectedOutcomes] = useState<string[]>([]);
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [assignedTo, setAssignedTo] = useState('');

  const [assignableUsers, setAssignableUsers] = useState<UserOption[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const {
    data, total, page, pageSize, loading, error,
    stageOptions, stageOutcomes,
    fetchData, goToPage, changePageSize,
  } = useLeadsHistory();

  // By default send active stage IDs (non-terminated)
  const activeStageIds = useMemo(
    () => stageOptions.filter((s) => ACTIVE_STAGE_NAMES.has(s.name)).map((s) => s.id),
    [stageOptions],
  );

  const buildFilters = useCallback((pg = 1, ps = 25): LeadsHistoryFilters => {
    const stageIds = selectedStages.length ? selectedStages : activeStageIds;
    return {
      page: pg,
      page_size: ps,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      stage_ids: stageIds.length ? stageIds.join(',') : undefined,
      outcome_ids: selectedOutcomes.length ? selectedOutcomes.join(',') : undefined,
      org_ids: selectedOrgs.length ? selectedOrgs.join(',') : undefined,
      assigned_to: assignedTo || undefined,
      active_only: false,
    };
  }, [dateFrom, dateTo, selectedStages, selectedOutcomes, selectedOrgs, assignedTo, activeStageIds]);

  // Initial fetch — needs stageOptions to know active stage IDs
  const initialFetched = useRef(false);
  useEffect(() => {
    if (initialFetched.current) return;
    // First fetch without stage filter (backend defaults to active_only=true)
    fetchData({ page: 1, page_size: 25, date_from: defaultDateFrom(), date_to: today(), active_only: true });
    initialFetched.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await orgsApi.all();
        if (!cancelled) setOrgs(Array.isArray(json.data) ? json.data as OrgOption[] : []);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!showAssignedTo) return;
    let cancelled = false;
    setLoadingUsers(true);
    (async () => {
      try {
        if (scope === 'team') {
          const res = await usersApi.team();
          if (cancelled) return;
          const members = (res.data as Array<Record<string, unknown>>).map((m) => ({
            id: m['memberId'] as string,
            label: (m['memberFullName'] as string) ?? (m['memberEmail'] as string) ?? '',
          }));
          members.unshift({ id: actor.id, label: `${actor.name} (me)` });
          setAssignableUsers(members);
        } else {
          const json = await usersApi.list();
          if (cancelled) return;
          const list = (json.data as Array<Record<string, unknown>> ?? []).map((u) => ({
            id: u['id'] as string,
            label: (u['full_name'] as string) ?? (u['email'] as string) ?? '',
          }));
          setAssignableUsers(list);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoadingUsers(false); }
    })();
    return () => { cancelled = true; };
  }, [showAssignedTo, scope, actor]);

  const statusLabelMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of stageOptions) m[s.name] = s.label;
    return m;
  }, [stageOptions]);

  const filteredOutcomes = useMemo(() => {
    if (!selectedStages.length) return stageOutcomes;
    return stageOutcomes.filter((o) => selectedStages.includes(o.stage_id));
  }, [stageOutcomes, selectedStages]);

  const handleApply = () => fetchData(buildFilters(1, pageSize));

  const handleReset = () => {
    setDateFrom(defaultDateFrom());
    setDateTo(today());
    setSelectedStages([]);
    setSelectedOutcomes([]);
    setSelectedOrgs([]);
    setAssignedTo('');
    fetchData({ page: 1, page_size: pageSize, date_from: defaultDateFrom(), date_to: today(), active_only: true });
  };

  const handleExport = (format: ExportFormat) => {
    exportRows(data, EXPORT_COLUMNS, buildFilename(['leads-history']), format);
  };

  return (
    <div className="w-full space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Leads History</h1>
          <p className="mt-1 text-xs text-[#64748B]">
            {loading ? 'Loading…' : `${total} lead${total !== 1 ? 's' : ''} found`}
          </p>
        </div>
        <DownloadButton onExport={handleExport} rowCount={data.length} disabled={loading} />
      </div>

      {/* ── Filters ── */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="From">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
          </FilterField>
          <FilterField label="To">
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
          </FilterField>

          <FilterField label="Stage">
            <MultiCheckDropdown
              placeholder="All active"
              options={stageOptions.map((s) => ({ value: s.id, label: s.label }))}
              selected={selectedStages}
              onChange={(v) => { setSelectedStages(v); setSelectedOutcomes([]); }}
            />
          </FilterField>

          <FilterField label="Outcome">
            <MultiCheckDropdown
              placeholder="All"
              options={filteredOutcomes.map((o) => ({ value: o.id, label: o.label }))}
              selected={selectedOutcomes}
              onChange={setSelectedOutcomes}
            />
          </FilterField>

          {orgs.length > 1 && (
            <FilterField label="Org">
              <select
                value={selectedOrgs[0] ?? ''}
                onChange={(e) => setSelectedOrgs(e.target.value ? [e.target.value] : [])}
                className={inputCls}
              >
                <option value="">All orgs</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </FilterField>
          )}

          {showAssignedTo && (
            <FilterField label="Assigned To">
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className={inputCls}
                disabled={loadingUsers}
              >
                <option value="">All</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>
            </FilterField>
          )}

          <div className="flex items-center gap-2">
            <button type="button" onClick={handleApply} disabled={loading}
              className="rounded-lg bg-[#0b6cbf] px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#095699] disabled:opacity-60">
              Apply
            </button>
            <button type="button" onClick={handleReset}
              className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-1.5 text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]">
              Reset
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>
      )}

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
        {loading && data.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-[#94A3B8]">Loading…</div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-[#94A3B8]">No leads match the filters.</div>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead className="bg-[#F8FAFC] text-left text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                  <tr>
                    <th className="px-4 py-2.5">Lead</th>
                    <th className="px-4 py-2.5">Branch</th>
                    <th className="px-4 py-2.5">Stage</th>
                    <th className="px-4 py-2.5">Outcome</th>
                    <th className="px-4 py-2.5">Assigned To</th>
                    <th className="px-4 py-2.5">Created</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {data.map((a) => (
                    <tr key={a.id} className="text-[#0F172A]">
                      <td className="px-4 py-2.5">
                        <p className="text-sm font-semibold">{a.lead_full_name ?? '—'}</p>
                        {a.lead_phone && <p className="text-[11px] text-[#64748B]">{a.lead_phone}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#475569]">{a.branch}</td>
                      <td className="px-4 py-2.5">
                        <StageBadge stage={a.lead_stage_label ?? a.lead_stage} terminated={a.is_terminated} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#475569]">{a.lead_stage_outcome_label ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <AssigneeBadge user={a.assigned_rep_name || a.assigned_rep_email ? { name: a.assigned_rep_name, email: a.assigned_rep_email ?? '' } : null} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#64748B]">{formatDate(a.lead_created_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <ActionBtn title="History" onClick={() => setHistoryLead(a)}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </ActionBtn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-[#F1F5F9] md:hidden">
              {data.map((a) => (
                <li key={a.id} className="space-y-1.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0F172A]">{a.lead_full_name ?? '—'}</p>
                      {a.lead_phone && <p className="text-xs text-[#64748B]">{a.lead_phone}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StageBadge stage={a.lead_stage_label ?? a.lead_stage} terminated={a.is_terminated} />
                      <ActionBtn title="History" onClick={() => setHistoryLead(a)}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </ActionBtn>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#64748B]">
                    <span>{a.branch}</span>
                    <span>·</span>
                    <AssigneeBadge user={a.assigned_rep_name || a.assigned_rep_email ? { name: a.assigned_rep_name, email: a.assigned_rep_email ?? '' } : null} />
                    <span>·</span>
                    <span>{formatDate(a.lead_created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>

            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={goToPage} onPageSizeChange={changePageSize} />
          </>
        )}
      </div>

      {historyLead && (
        <LeadHistoryModal lead={{ lead_id: historyLead.lead_id }} onClose={() => setHistoryLead(null)} />
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

const inputCls =
  'rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs text-[#0F172A] shadow-sm focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20';

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</span>}
      {children}
    </div>
  );
}

function ActionBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className="inline-flex items-center justify-center rounded-lg border border-[#E2E8F0] bg-white p-1.5 text-[#475569] transition-colors hover:border-[#0b6cbf] hover:text-[#0b6cbf]">
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{children}</svg>
    </button>
  );
}

function StageBadge({ stage, terminated }: { stage: string | null; terminated: boolean }) {
  if (!stage) return <span className="text-xs text-[#CBD5E1]">—</span>;
  const color = terminated ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700';
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>{stage}</span>;
}

// ── Multi-check dropdown ──────────────────────────────────────────────────

interface DropdownOption { value: string; label: string }

function MultiCheckDropdown({
  placeholder, options, selected, onChange,
}: {
  placeholder: string;
  options: DropdownOption[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]);
  };

  const label = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? '1 selected')
      : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${inputCls} flex min-w-[140px] items-center justify-between gap-2 whitespace-nowrap`}
      >
        <span className="truncate">{label}</span>
        <svg className="h-3 w-3 shrink-0 text-[#94A3B8]" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-52 min-w-[180px] overflow-y-auto rounded-lg border border-[#E2E8F0] bg-white py-1 shadow-lg">
          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-[#94A3B8]">No options</p>
          )}
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-[#0F172A] hover:bg-[#F8FAFC]">
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="rounded border-[#CBD5E1]"
              />
              {o.label}
            </label>
          ))}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full border-t border-[#F1F5F9] px-3 py-1.5 text-left text-[10px] font-semibold text-[#0b6cbf] hover:bg-[#F8FAFC]"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
