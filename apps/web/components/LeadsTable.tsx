'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridReadyEvent, ICellRendererParams, RowClassParams } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import type { LeadView, SessionUser } from '@crm/types';
import type { StageOutcome, UpdatePayload } from '@/src/types/leads';
import type { CardFilter } from '@/components/dashboard/LeadDashboardShell';
import { applyLeadFilter } from '@/src/lib/leads/filter';
import { leads as leadsApi } from '@/src/lib/api/client';
import { LeadHistoryModal } from './LeadHistoryModal';
import UserPicker from '@/components/common/UserPicker';

ModuleRegistry.registerModules([AllCommunityModule]);

interface Props {
  leads: LeadView[];
  loading: boolean;
  statusFilter?: CardFilter;
  onUpdate: (payload: UpdatePayload) => Promise<void>;
  newLeadRowKeys: Set<string>;
  statusOptions: string[];
  statusLabelMap?: Record<string, string>;
  actor: SessionUser;
  assignmentCandidates: SessionUser[];
  onAssignmentChanged: () => void;
  requiresFollowupStatuses?: Set<string> | string[];
  rejectionStatuses?: Set<string> | string[];
  stageOutcomes?: StageOutcome[];
  stageIdToName?: Record<string, string>;
}

// ── Breakpoint hook ───────────────────────────────────────────────────────────
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return mobile;
}

// ── Status config — keyed by DB stage name ────────────────────────────────────
const STATUS_CONFIG: Record<string, { bg: string; color: string; dot: string }> = {
  new:             { bg: '#EFF6FF', color: '#1D4ED8', dot: '#3B82F6' },
  contacting:      { bg: '#FFF7ED', color: '#C2410C', dot: '#F97316' },
  qualified:       { bg: '#FAF5FF', color: '#7E22CE', dot: '#A855F7' },
  converted:       { bg: '#F0FDF4', color: '#15803D', dot: '#22C55E' },
  unqualified:     { bg: '#FEF2F2', color: '#B91C1C', dot: '#EF4444' },
  transferred_out: { bg: '#FFFBEB', color: '#92400E', dot: '#F59E0B' },
};

function StatusBadge({ value, labelMap }: { value: string; labelMap?: Record<string, string> }) {
  const cfg   = STATUS_CONFIG[value];
  const bg    = cfg?.bg    ?? '#F1F5F9';
  const color = cfg?.color ?? '#475569';
  const dot   = cfg?.dot   ?? '#94A3B8';
  const text  = labelMap?.[value] ?? value;
  return (
    <span style={{ background: bg, color }} className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold">
      <span style={{ background: dot }} className="w-1.5 h-1.5 rounded-full shrink-0" />
      {text || '—'}
    </span>
  );
}

function AssigneeBadge({ name }: { name: string | null }) {
  if (!name) return <span className="text-[11px] italic text-[#94A3B8]">Unassigned</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-semibold text-[#0b6cbf]">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0b6cbf] text-[9px] font-bold text-white">
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="max-w-[100px] truncate">{name}</span>
    </span>
  );
}

const CAN_ASSIGN_ROLES: ReadonlyArray<SessionUser['role']> = [
  'super_admin', 'tenant_admin', 'org_admin', 'org_sr_manager',
  'org_manager', 'senior_sales_executive',
];

// ── Mobile Lead Card ──────────────────────────────────────────────────────────
interface MobileCardProps {
  lead: LeadView;
  isNew: boolean;
  statusLabelMap?: Record<string, string>;
  onEditClick: (lead: LeadView) => void;
  onHistoryClick: (lead: LeadView) => void;
  onViewClick: (lead: LeadView) => void;
}

function MobileLeadCard({ lead, isNew, statusLabelMap, onEditClick, onHistoryClick, onViewClick }: MobileCardProps) {
  const assigneeName = lead.assigned_rep_name ?? null;

  return (
    <div className={[
      'bg-white rounded-2xl border shadow-sm mx-4 flex flex-col gap-0 overflow-hidden transition-shadow',
      isNew ? 'border-[#93C5FD] shadow-blue-100' : 'border-[#E2E8F0]',
    ].join(' ')}>
      {isNew && (
        <div className="bg-[#DBEAFE] px-4 py-1.5 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse" />
          <span className="text-xs font-semibold text-[#1D4ED8]">New Lead</span>
        </div>
      )}

      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-base font-bold text-[#0F172A] truncate">{lead.full_name || '—'}</span>
          <a href={`tel:${lead.phone}`} className="text-sm font-medium text-[#0A6BA8] flex items-center gap-1">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498A1 1 0 0121 17.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            {lead.phone || '—'}
          </a>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0 pt-0.5">
          <StatusBadge value={lead.stage ?? ''} labelMap={statusLabelMap ?? {}} />
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => onViewClick(lead)}
              className="flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-semibold text-[#475569] transition-colors hover:border-[#0891b2] hover:text-[#0891b2] active:scale-[0.97]"
              style={{ minHeight: 28 }}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              View
            </button>
            <button type="button" onClick={() => onEditClick(lead)}
              className="flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-semibold text-[#475569] transition-colors hover:border-[#0b6cbf] hover:text-[#0b6cbf] active:scale-[0.97]"
              style={{ minHeight: 28 }}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
            <button type="button" onClick={() => onHistoryClick(lead)}
              className="flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-semibold text-[#475569] transition-colors hover:border-[#7C3AED] hover:text-[#7C3AED] active:scale-[0.97]"
              style={{ minHeight: 28 }}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              History
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pb-2 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">Assigned To</span>
        <AssigneeBadge name={assigneeName} />
      </div>

      <div className="h-px bg-[#F1F5F9] mx-4" />

      <div className="px-4 py-3 flex flex-col gap-2">
        {lead.address_line1 && (
          <div className="flex items-start gap-2">
            <span className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wide w-20 shrink-0 pt-0.5">Address</span>
            <span className="text-sm text-[#0F172A]">{lead.address_line1}</span>
          </div>
        )}
        {lead.campaign_name && (
          <div className="flex items-start gap-2">
            <span className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wide w-20 shrink-0 pt-0.5">Campaign</span>
            <span className="text-sm text-[#475569]">{lead.campaign_name}</span>
          </div>
        )}
        {lead.created_at && (
          <div className="flex items-start gap-2">
            <span className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wide w-20 shrink-0 pt-0.5">Date</span>
            <span className="text-sm text-[#64748B]">{new Date(lead.created_at).toLocaleDateString('en-IN')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── AG Grid CSS ───────────────────────────────────────────────────────────────
const GRID_STYLES = `
  .ag-theme-alpine {
    --ag-font-size: 13px;
    --ag-font-family: ui-sans-serif, system-ui, sans-serif;
    --ag-header-background-color: #F8FAFC;
    --ag-header-foreground-color: #64748B;
    --ag-border-color: #E2E8F0;
    --ag-row-border-color: #F1F5F9;
    --ag-row-hover-color: #F0F9FF;
    --ag-selected-row-background-color: #EFF6FF;
    --ag-odd-row-background-color: #FFFFFF;
    --ag-background-color: #FFFFFF;
    --ag-secondary-foreground-color: #64748B;
    --ag-input-focus-border-color: #0A6BA8;
    --ag-range-selection-border-color: #0A6BA8;
    --ag-checkbox-checked-color: #0A6BA8;
  }
  .ag-theme-alpine .ag-header-cell-text {
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #64748B;
  }
  .ag-theme-alpine .ag-header-cell { border-right: 1px solid #F1F5F9; }
  .ag-theme-alpine .ag-row { border-bottom: 1px solid #F8FAFC; }
  .ag-theme-alpine .ag-paging-panel {
    border-top: 1px solid #E2E8F0;
    font-size: 12px;
    color: #64748B;
    background: #F8FAFC;
    padding: 8px 16px;
  }
  .ag-theme-alpine .ag-body-viewport,
  .ag-theme-alpine .ag-body-horizontal-scroll-viewport,
  .ag-theme-alpine .ag-body-vertical-scroll-viewport {
    scrollbar-width: thin;
    scrollbar-color: #b8c2d1 #eef2f7;
  }
  .ag-theme-alpine .ag-body-viewport::-webkit-scrollbar,
  .ag-theme-alpine .ag-body-horizontal-scroll-viewport::-webkit-scrollbar,
  .ag-theme-alpine .ag-body-vertical-scroll-viewport::-webkit-scrollbar { width: 8px; height: 8px; }
  .ag-theme-alpine .ag-body-viewport::-webkit-scrollbar-track,
  .ag-theme-alpine .ag-body-horizontal-scroll-viewport::-webkit-scrollbar-track,
  .ag-theme-alpine .ag-body-vertical-scroll-viewport::-webkit-scrollbar-track { background: #eef2f7; border-radius: 999px; }
  .ag-theme-alpine .ag-body-viewport::-webkit-scrollbar-thumb,
  .ag-theme-alpine .ag-body-horizontal-scroll-viewport::-webkit-scrollbar-thumb,
  .ag-theme-alpine .ag-body-vertical-scroll-viewport::-webkit-scrollbar-thumb { background: #b8c2d1; border-radius: 999px; }
  .ag-theme-alpine .ag-body-viewport::-webkit-scrollbar-thumb:hover,
  .ag-theme-alpine .ag-body-horizontal-scroll-viewport::-webkit-scrollbar-thumb:hover,
  .ag-theme-alpine .ag-body-vertical-scroll-viewport::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
`;

// ── Lead Edit Modal ───────────────────────────────────────────────────────────
interface EditModalProps {
  lead: LeadView;
  statusOptions: string[];
  statusLabelMap: Record<string, string>;
  followUpSet: Set<string>;
  rejectionSet: Set<string>;
  stageOutcomes: StageOutcome[];
  stageIdToName: Record<string, string>;
  candidates: SessionUser[];
  actor: SessionUser;
  onUpdate: (payload: UpdatePayload) => Promise<void>;
  onAssignmentChanged: () => void;
  onClose: () => void;
}

function LeadEditModal({
  lead, statusOptions, statusLabelMap, followUpSet, rejectionSet,
  stageOutcomes, stageIdToName, candidates, actor, onUpdate, onAssignmentChanged, onClose,
}: EditModalProps) {
  const origStatus     = lead.stage ?? '';
  const origAssigneeId = lead.assigned_user_id ?? null;

  const [selectedStatus,    setSelectedStatus]    = useState(origStatus);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(origAssigneeId);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [fuAssigneeId, setFuAssigneeId] = useState(() => candidates[0]?.id ?? '');
  const [fuScheduledAt, setFuScheduledAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [fuNotes, setFuNotes] = useState('');
  const [outcomeId,     setOutcomeId]     = useState<string | ''>('');
  const [rejNotes,      setRejNotes]      = useState('');
  const [transitionNote, setTransitionNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Invert stageIdToName to get stageNameToId for outcome lookup
  const stageNameToId = useMemo(() => {
    const inv: Record<string, string> = {};
    for (const [id, name] of Object.entries(stageIdToName)) inv[name] = id;
    return inv;
  }, [stageIdToName]);

  const canAssign        = CAN_ASSIGN_ROLES.includes(actor.role);
  const statusChanged    = selectedStatus !== origStatus;
  const assigneeChanged  = selectedAssigneeId !== origAssigneeId;
  const showFollowUp     = statusChanged && followUpSet.has(selectedStatus);
  const showRejection    = statusChanged && rejectionSet.has(selectedStatus);

  const selectedStageId   = stageNameToId[selectedStatus];
  const filteredOutcomes  = stageOutcomes.filter(o => o.stage_id === selectedStageId);
  const hasOutcomes       = filteredOutcomes.length > 0;
  const selectedOutcome   = filteredOutcomes.find(o => o.id === outcomeId);
  const notesRequired     = showRejection && (selectedOutcome?.requires_comment ?? false);

  const currentAssigneeName = (() => {
    if (!origAssigneeId) return null;
    const inList = candidates.find(u => u.id === origAssigneeId);
    if (inList) return inList.name ?? inList.email;
    return lead.assigned_rep_name ?? null;
  })();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (showFollowUp) {
      if (!fuAssigneeId)      errs.fuAssignee   = 'Required';
      if (!fuScheduledAt)     errs.fuScheduledAt = 'Required';
      if (!fuNotes.trim())    errs.fuNotes       = 'Notes are required';
    }
    if (showRejection) {
      if (hasOutcomes && !outcomeId)                    errs.outcome  = 'Select a reason';
      if (notesRequired && !rejNotes.trim()) errs.rejNotes = 'Notes are required for this reason';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (statusChanged) {
        await onUpdate({
          leadId: lead.lead_id,
          field: 'stage',
          value: selectedStatus,
          ...(showFollowUp ? {
            followUp: {
              assignedUserId: fuAssigneeId,
              scheduledAt: new Date(fuScheduledAt).toISOString(),
              notes: fuNotes.trim(),
            },
          } : {}),
          ...((showFollowUp || showRejection) && outcomeId !== '' ? { outcomeId } : {}),
          ...(showRejection && rejNotes.trim()
            ? { transitionNote: rejNotes.trim() }
            : (!showRejection && !showFollowUp && transitionNote.trim()
              ? { transitionNote: transitionNote.trim() }
              : {})),
        });
      }

      const autoAssign      = showRejection && !origAssigneeId;
      const assigneeToSet   = autoAssign ? actor.id : selectedAssigneeId;
      const shouldPatchAssignee = autoAssign || (assigneeChanged && lead.lead_id);

      if (shouldPatchAssignee && lead.lead_id) {
        await leadsApi.update(lead.lead_id, {
          assigned_user_id: assigneeToSet,
          ...(transitionNote.trim() ? { transition_note: transitionNote.trim() } : {}),
        });
      }
      onAssignmentChanged();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = (value: string) => {
    setSelectedStatus(value);
    setErrors({});
    setFuNotes('');
    setOutcomeId('');
    setRejNotes('');
    setTransitionNote('');
  };

  const infoItems = [
    { label: 'Date',        value: lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-IN') : '—', full: false },
    { label: 'Lead Source', value: lead.source ?? lead.platform ?? '—',          full: false },
    { label: 'Campaign',    value: lead.campaign_name ?? '—',                    full: false },
    { label: 'Address',     value: lead.address_line1 ?? lead.city_name ?? '—',  full: true },
    ...(lead.outcome_label ? [{ label: 'Outcome', value: lead.outcome_label, full: false }] : []),
    ...(lead.outcome_comment ? [{ label: 'Note', value: lead.outcome_comment, full: true }] : []),
  ];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-[2px] p-4 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="my-auto w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#F1F5F9] px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#0F172A]">Edit Lead</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="text-sm font-medium text-[#0F172A]">{lead.full_name || '—'}</span>
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs text-[#0b6cbf] hover:underline">
                  <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498A1 1 0 0121 17.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {lead.phone}
                </a>
              )}
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs text-[#0b6cbf] hover:underline">
                  <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {lead.email}
                </a>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#64748B] hover:bg-[#F1F5F9]">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col divide-y divide-[#F1F5F9]">
          {/* Read-only lead details */}
          <div className="px-6 py-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">Lead Details</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              {infoItems.map(({ label, value, full }) => (
                <div key={label} className={`flex items-start gap-2${full ? ' col-span-2' : ''}`}>
                  <span className="w-20 shrink-0 pt-px text-xs font-semibold text-[#94A3B8]">{label}</span>
                  <span className="break-all text-sm text-[#0F172A]">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Editable fields */}
          <div className="flex flex-col gap-4 px-6 py-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">Update</p>

            {/* Status */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{statusLabelMap[s] ?? s}</option>
                ))}
              </select>
            </div>

            {/* Assignee */}
            {!rejectionSet.has(origStatus) && !(showRejection && !origAssigneeId) && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Assigned To</label>
                {canAssign ? (
                  <UserPicker
                    value={selectedAssigneeId ?? ''}
                    onChange={(id) => setSelectedAssigneeId(id || null)}
                    users={candidates}
                    allowEmpty
                    emptyLabel="Unassigned"
                    extraOption={
                      origAssigneeId && !candidates.some(c => c.id === origAssigneeId)
                        ? { id: origAssigneeId, label: `${currentAssigneeName ?? origAssigneeId} (current)` }
                        : undefined
                    }
                  />
                ) : (
                  <div className="px-3 py-2 text-sm text-[#64748B]">{currentAssigneeName ?? 'Unassigned'}</div>
                )}
              </div>
            )}

            {/* General notes */}
            {(statusChanged || assigneeChanged) && !showFollowUp && !showRejection && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                  Notes <span className="text-[#94A3B8] font-normal normal-case">(optional)</span>
                </label>
                <textarea
                  value={transitionNote}
                  onChange={(e) => setTransitionNote(e.target.value)}
                  placeholder="Add a note about this change…"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#CBD5E1] focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20"
                />
              </div>
            )}

            {/* Follow-up panel */}
            {showFollowUp && (
              <div className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 shrink-0 text-[#0b6cbf]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs font-bold uppercase tracking-wide text-[#0b6cbf]">Follow-up Required</span>
                </div>

                {hasOutcomes && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                      Outcome <span className="text-[#94A3B8] font-normal normal-case">(optional)</span>
                    </label>
                    <select
                      value={outcomeId}
                      onChange={(e) => { setOutcomeId(e.target.value); setErrors(p => ({ ...p, outcome: '' })); }}
                      className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] focus:border-[#0b6cbf] focus:outline-none focus:ring-2 focus:ring-[#0b6cbf]/20"
                    >
                      <option value="">None</option>
                      {filteredOutcomes.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                    Assign To <span className="text-red-500">*</span>
                  </label>
                  <UserPicker
                    value={fuAssigneeId}
                    onChange={(id) => { setFuAssigneeId(id); setErrors(p => ({ ...p, fuAssignee: '' })); }}
                    users={candidates}
                    hasError={!!errors.fuAssignee}
                    placeholder={candidates.length === 0 ? 'No assignees available' : 'Select a user…'}
                  />
                  {errors.fuAssignee && <p className="text-xs text-red-500">{errors.fuAssignee}</p>}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                    Schedule Date & Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={fuScheduledAt}
                    onChange={(e) => { setFuScheduledAt(e.target.value); setErrors(p => ({ ...p, fuScheduledAt: '' })); }}
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 ${errors.fuScheduledAt ? 'border-red-400 focus:ring-red-200' : 'border-[#E2E8F0] focus:border-[#0b6cbf] focus:ring-[#0b6cbf]/20'}`}
                  />
                  {errors.fuScheduledAt && <p className="text-xs text-red-500">{errors.fuScheduledAt}</p>}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                    Notes <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={fuNotes}
                    onChange={(e) => { setFuNotes(e.target.value); if (e.target.value.trim()) setErrors(p => ({ ...p, fuNotes: '' })); }}
                    placeholder="Add follow-up notes…"
                    rows={3}
                    className={`w-full resize-none rounded-lg border px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#CBD5E1] focus:outline-none focus:ring-2 ${errors.fuNotes ? 'border-red-400 focus:ring-red-200' : 'border-[#E2E8F0] focus:border-[#0b6cbf] focus:ring-[#0b6cbf]/20'}`}
                  />
                  {errors.fuNotes && <p className="text-xs text-red-500">{errors.fuNotes}</p>}
                </div>
              </div>
            )}

            {/* Rejection panel */}
            {showRejection && (
              <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 shrink-0 text-[#B91C1C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs font-bold uppercase tracking-wide text-[#B91C1C]">Rejection Confirmation</span>
                </div>

                {hasOutcomes && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                      Reason for Rejection <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={outcomeId}
                      onChange={(e) => { setOutcomeId(e.target.value); setErrors(p => ({ ...p, outcome: '' })); }}
                      className={`w-full rounded-lg border px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 ${errors.outcome ? 'border-red-400 focus:ring-red-200' : 'border-[#E2E8F0] focus:border-[#0b6cbf] focus:ring-[#0b6cbf]/20'}`}
                    >
                      <option value="" disabled>Select a reason…</option>
                      {filteredOutcomes.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                    {errors.outcome && <p className="text-xs text-red-500">{errors.outcome}</p>}
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                    Notes
                    {notesRequired
                      ? <span className="ml-1 text-red-500">*</span>
                      : <span className="ml-1 font-normal normal-case text-[#94A3B8]">(optional)</span>
                    }
                  </label>
                  <textarea
                    value={rejNotes}
                    onChange={(e) => { setRejNotes(e.target.value); if (e.target.value.trim()) setErrors(p => ({ ...p, rejNotes: '' })); }}
                    placeholder={`Why is this lead being moved to ${statusLabelMap[selectedStatus] ?? selectedStatus}?`}
                    rows={3}
                    className={`w-full resize-none rounded-lg border px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#CBD5E1] focus:outline-none focus:ring-2 ${errors.rejNotes ? 'border-red-400 focus:ring-red-200' : 'border-[#E2E8F0] focus:border-[#0b6cbf] focus:ring-[#0b6cbf]/20'}`}
                  />
                  {errors.rejNotes && <p className="text-xs text-red-500">{errors.rejNotes}</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        {saveError && (
          <div className="mx-6 mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
            {saveError}
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-[#F1F5F9] px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-semibold text-[#475569] transition-colors hover:bg-[#F8FAFC] disabled:opacity-60">
            Cancel
          </button>
          <button type="button" onClick={handleSave}
            disabled={saving || (!statusChanged && !assigneeChanged)}
            className="rounded-lg bg-[#0b6cbf] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0a5fa8] disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? (
              <span className="inline-flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Saving…
              </span>
            ) : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Lead View Modal (read-only) ───────────────────────────────────────────────
interface ViewModalProps {
  lead: LeadView;
  statusLabelMap: Record<string, string>;
  onClose: () => void;
}

function LeadViewModal({ lead, statusLabelMap, onClose }: ViewModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const assigneeName = lead.assigned_rep_name ?? null;
  const statusCfg    = STATUS_CONFIG[lead.stage ?? ''];
  const statusLabel  = statusLabelMap[lead.stage ?? ''] ?? lead.stage_label ?? lead.stage ?? '—';

  const coreFields = [
    { label: 'Date',        value: lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-IN') : '—', full: false },
    { label: 'Lead Source', value: lead.source ?? lead.platform ?? '—',         full: false },
    { label: 'Campaign',    value: lead.campaign_name ?? '—',                   full: true },
    { label: 'Address',     value: lead.address_line1 ?? lead.city_name ?? '—', full: true },
  ];

  const extraFields = [
    { label: 'Organization', value: lead.org_name, full: true },
    { label: 'Branch',       value: lead.branch,   full: false },
  ].filter(f => f.value);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-[2px] p-4 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="my-auto w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#F1F5F9] px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#0F172A]">Lead Details</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="text-sm font-medium text-[#0F172A]">{lead.full_name || '—'}</span>
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs text-[#0b6cbf] hover:underline">
                  <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498A1 1 0 0121 17.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {lead.phone}
                </a>
              )}
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs text-[#0b6cbf] hover:underline">
                  <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {lead.email}
                </a>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#64748B] hover:bg-[#F1F5F9]">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col divide-y divide-[#F1F5F9]">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 px-6 py-4">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">Status</span>
              <span
                className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{ background: statusCfg?.bg ?? '#F1F5F9', color: statusCfg?.color ?? '#475569' }}
              >
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: statusCfg?.dot ?? '#94A3B8' }} />
                {statusLabel}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">Assigned To</span>
              <AssigneeBadge name={assigneeName} />
            </div>
            {lead.outcome_label && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">Outcome</span>
                <span className="inline-flex w-fit items-center rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-xs font-medium text-[#475569]">
                  {lead.outcome_label}
                </span>
              </div>
            )}
            {lead.outcome_comment && (
              <div className={`flex flex-col gap-1 ${lead.outcome_label ? '' : 'col-span-2'}`}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">Outcome Note</span>
                <span className="text-sm text-[#0F172A]">{lead.outcome_comment}</span>
              </div>
            )}
          </div>

          <div className="px-6 py-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">Lead Details</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              {coreFields.map(({ label, value, full }) => (
                <div key={label} className={`flex items-start gap-2${full ? ' col-span-2' : ''}`}>
                  <span className="w-24 shrink-0 pt-px text-xs font-semibold text-[#94A3B8]">{label}</span>
                  <span className="break-all text-sm text-[#0F172A]">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {extraFields.length > 0 && (
            <div className="px-6 py-4">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#94A3B8]">Additional Info</p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                {extraFields.map(({ label, value, full }) => (
                  <div key={label} className={`flex items-start gap-2${full ? ' col-span-2' : ''}`}>
                    <span className="w-24 shrink-0 pt-px text-xs font-semibold text-[#94A3B8]">{label}</span>
                    <span className="break-all text-sm text-[#0F172A]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end px-6 py-4">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LeadsTable({
  leads, loading, statusFilter = 'all', onUpdate,
  newLeadRowKeys, statusOptions, statusLabelMap,
  actor, assignmentCandidates, onAssignmentChanged,
  requiresFollowupStatuses, rejectionStatuses,
  stageOutcomes, stageIdToName,
}: Props) {
  const gridRef = useRef<AgGridReact>(null);
  const isMobile = useIsMobile();
  const [editingLead,  setEditingLead]  = useState<LeadView | null>(null);
  const [historyLead,  setHistoryLead]  = useState<LeadView | null>(null);
  const [viewingLead,  setViewingLead]  = useState<LeadView | null>(null);

  const followUpSet = useMemo(
    () => requiresFollowupStatuses instanceof Set ? requiresFollowupStatuses : new Set(requiresFollowupStatuses ?? []),
    [requiresFollowupStatuses],
  );
  const rejectionSet = useMemo(
    () => rejectionStatuses instanceof Set ? rejectionStatuses : new Set(rejectionStatuses ?? []),
    [rejectionStatuses],
  );

  const filtered = useMemo(
    () => applyLeadFilter(leads, statusFilter, [...followUpSet]),
    [leads, statusFilter, followUpSet],
  );

  const assigneeCellRenderer = useCallback((params: ICellRendererParams<LeadView>) => {
    const lead = params.data;
    if (!lead) return null;
    const name = lead.assigned_rep_name ?? null;
    return (
      <span style={{ color: name ? '#0F172A' : '#94A3B8', fontStyle: name ? 'normal' : 'italic' }}>
        {name ?? 'Unassigned'}
      </span>
    );
  }, []);

  const actionsCellRenderer = useCallback((params: ICellRendererParams<LeadView>) => {
    const lead = params.data;
    if (!lead) return null;
    const ctx = params.context as { onEdit: (l: LeadView) => void; onHistory: (l: LeadView) => void; onView: (l: LeadView) => void; };
    return (
      <div className="flex items-center gap-1.5">
        <button type="button" title="View" onClick={() => ctx.onView(lead)}
          className="inline-flex items-center justify-center rounded-lg border border-[#E2E8F0] bg-white p-1.5 text-[#475569] transition-colors hover:border-[#0891b2] hover:text-[#0891b2]">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
        <button type="button" title="Edit" onClick={() => ctx.onEdit(lead)}
          className="inline-flex items-center justify-center rounded-lg border border-[#E2E8F0] bg-white p-1.5 text-[#475569] transition-colors hover:border-[#0b6cbf] hover:text-[#0b6cbf]">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button type="button" title="History" onClick={() => ctx.onHistory(lead)}
          className="inline-flex items-center justify-center rounded-lg border border-[#E2E8F0] bg-white p-1.5 text-[#475569] transition-colors hover:border-[#7C3AED] hover:text-[#7C3AED]">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>
    );
  }, []);

  const columnDefs = useMemo((): ColDef<LeadView>[] => [
    {
      colId: 'date', headerName: 'Date', width: 120, sortable: true, filter: true, editable: false,
      valueGetter: (p) => p.data?.created_at ? new Date(p.data.created_at).toLocaleDateString('en-IN') : '',
    },
    {
      colId: 'name', headerName: 'Name', flex: 1, minWidth: 150, sortable: true, filter: true, editable: false,
      valueGetter: (p) => p.data?.full_name ?? '',
    },
    {
      colId: 'phone', headerName: 'Phone', width: 140, sortable: false, filter: false, editable: false,
      valueGetter: (p) => p.data?.phone ?? '',
    },
    {
      colId: 'status', headerName: 'Status', width: 165, sortable: true, filter: true, editable: false,
      valueGetter: (p) => p.data?.stage ?? '',
      cellRenderer: (p: ICellRendererParams<LeadView>) => (
        <StatusBadge value={p.data?.stage ?? ''} labelMap={statusLabelMap ?? {}} />
      ),
      cellStyle: { display: 'flex', alignItems: 'center' } as Record<string, string>,
    },
    {
      colId: 'outcome', headerName: 'Outcome', width: 180, sortable: true, filter: true, editable: false,
      valueGetter: (p) => p.data?.outcome_label ?? p.data?.outcome ?? '',
      cellRenderer: (p: ICellRendererParams<LeadView>) => {
        const val = p.data?.outcome_label ?? p.data?.outcome;
        return val
          ? <span style={{ background: '#F1F5F9', color: '#475569' }} className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">{val}</span>
          : <span className="text-xs text-[#CBD5E1]">—</span>;
      },
      cellStyle: { display: 'flex', alignItems: 'center' } as Record<string, string>,
    },
    {
      colId: '__assignee', headerName: 'Assigned To', width: 170, minWidth: 130, sortable: true, filter: true, editable: false,
      valueGetter: (p) => p.data?.assigned_rep_name ?? 'Unassigned',
      cellRenderer: assigneeCellRenderer,
      cellStyle: { display: 'flex', alignItems: 'center', paddingLeft: '12px', paddingRight: '12px' },
    },
    {
      colId: '__actions', headerName: '', width: 120, minWidth: 120, maxWidth: 120,
      pinned: 'right', sortable: false, filter: false, editable: false, resizable: false,
      cellRenderer: actionsCellRenderer,
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible', gap: '6px' },
    },
  ], [statusLabelMap, assigneeCellRenderer, actionsCellRenderer]);

  const defaultColDef: ColDef = useMemo(() => ({
    resizable: true,
    suppressMovable: false,
    cellStyle: { fontSize: '13px', color: '#0F172A' },
  }), []);

  const gridContext = useMemo(() => ({
    actor,
    onEdit:    setEditingLead,
    onHistory: setHistoryLead,
    onView:    setViewingLead,
  }), [actor]);

  const onGridReady = useCallback((_: GridReadyEvent) => {}, []);

  const getRowClass = useCallback((params: RowClassParams<LeadView>) => {
    if (!params.data) return '';
    return newLeadRowKeys.has(params.data.lead_id) ? 'new-lead-row' : '';
  }, [newLeadRowKeys]);

  const editModal = editingLead ? (
    <LeadEditModal
      lead={editingLead}
      statusOptions={statusOptions}
      statusLabelMap={statusLabelMap ?? {}}
      followUpSet={followUpSet}
      rejectionSet={rejectionSet}
      stageOutcomes={stageOutcomes ?? []}
      stageIdToName={stageIdToName ?? {}}
      candidates={assignmentCandidates}
      actor={actor}
      onUpdate={onUpdate}
      onAssignmentChanged={onAssignmentChanged}
      onClose={() => setEditingLead(null)}
    />
  ) : null;

  const historyModal = historyLead ? (
    <LeadHistoryModal
      lead={historyLead}
      statusLabelMap={statusLabelMap ?? {}}
      onClose={() => setHistoryLead(null)}
    />
  ) : null;

  const viewModal = viewingLead ? (
    <LeadViewModal
      lead={viewingLead}
      statusLabelMap={statusLabelMap ?? {}}
      onClose={() => setViewingLead(null)}
    />
  ) : null;

  if (loading) {
    return (
      <>
        {editModal}{historyModal}{viewModal}
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-[#94A3B8]">
          <svg className="w-6 h-6 animate-spin text-[#0A6BA8]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm">Loading leads…</span>
        </div>
      </>
    );
  }

  // Mobile card list
  if (isMobile) {
    if (filtered.length === 0) {
      return (
        <>
          {editModal}{historyModal}{viewModal}
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#94A3B8]">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium">No leads found</span>
          </div>
        </>
      );
    }
    return (
      <>
        {editModal}{historyModal}{viewModal}
        <div className="flex flex-col gap-3 py-4 pb-8">
          <div className="px-4 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">
              {filtered.length} lead{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
          {filtered.map((lead) => (
            <MobileLeadCard
              key={lead.lead_id}
              lead={lead}
              isNew={newLeadRowKeys.has(lead.lead_id)}
              statusLabelMap={statusLabelMap ?? {}}
              onEditClick={setEditingLead}
              onHistoryClick={setHistoryLead}
              onViewClick={setViewingLead}
            />
          ))}
        </div>
      </>
    );
  }

  // Desktop AG Grid
  return (
    <>
      {editModal}{historyModal}{viewModal}
      <div
        className="ag-theme-alpine"
        style={{ flex: '1 1 0', minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <style>{GRID_STYLES}</style>
        <AgGridReact<LeadView>
          ref={gridRef}
          rowData={filtered}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          context={gridContext}
          onGridReady={onGridReady}
          pagination
          paginationPageSize={25}
          paginationPageSizeSelector={[25, 50, 100]}
          rowHeight={48}
          headerHeight={44}
          animateRows={false}
          suppressCellFocus={false}
          enableCellTextSelection
          alwaysShowHorizontalScroll
          alwaysShowVerticalScroll
          getRowId={(params) => params.data.lead_id}
          getRowClass={getRowClass}
        />
      </div>
    </>
  );
}
