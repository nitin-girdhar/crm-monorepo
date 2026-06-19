'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SessionUser } from '@crm/types';
import { useBranches, type DynamicBranch } from '@/hooks/useBranches';
import { useLeads } from '@/hooks/useLeads';
import { useLocationFilters } from '@/hooks/useLocationFilters';
import { useLeadSources } from '@/hooks/useLeadSources';
import LocationFilters from '@/components/dashboard/LocationFilters';
import StatsCards from '@/components/StatsCards';
import LeadsTable from '@/components/LeadsTable';
import DownloadButton from '@/components/common/DownloadButton';
import { applyLeadFilter } from '@/src/lib/leads/filter';
import { buildLeadExportColumns } from '@/src/lib/export/lead-columns';
import { buildFilename, exportRows, type ExportFormat } from '@/src/lib/export/export';

const INLINE_ASSIGN_ROLES: ReadonlyArray<SessionUser['role']> = [
  'super_admin', 'tenant_admin', 'org_admin', 'org_sr_manager',
  'org_manager', 'senior_sales_executive',
];

export type CardFilter =
  | 'all'
  | 'new'
  | 'callAttempted'
  | 'unqualified'
  | 'visitScheduled'
  | 'converted'
  | 'followUp'
  | 'unassigned';

const FILTER_LABELS: Record<CardFilter, string> = {
  all:            'All Leads',
  new:            'New Leads',
  callAttempted:  'Call Attempted',
  unqualified:    'Unqualified Leads',
  visitScheduled: 'Visit Scheduled',
  converted:      'Converted',
  followUp:       'Follow-up Required',
  unassigned:     'Unassigned Leads',
};

interface Props {
  actor: SessionUser;
}

export default function LeadDashboardShell({ actor }: Props) {
  const [activeFilter, setActiveFilter] = useState<CardFilter>('all');

  const {
    countries, states, cities,
    selectedCountries, selectedStates, selectedCities,
    setSelectedCountries, setSelectedStates, setSelectedCities,
    loadingCountries, loadingStates, loadingCities,
  } = useLocationFilters();

  const locationFilter = useMemo(() => {
    const f: { cityIds: number[]; stateIds?: number[]; countryIds?: number[] } = {
      cityIds: selectedCities.map(c => c.id),
    };
    if (selectedCities.length === 0) f.stateIds = selectedStates.map(s => s.id);
    if (selectedStates.length === 0 && selectedCities.length === 0) f.countryIds = selectedCountries.map(c => c.id);
    return f;
  }, [selectedCountries, selectedStates, selectedCities]);

  const { branches, loading: branchesLoading, error: branchesError } = useBranches(locationFilter);
  const [selectedBranches, setSelectedBranches] = useState<DynamicBranch[]>([]);
  const { sources: leadSources, loading: sourcesLoading } = useLeadSources();
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

  const hasLocationFilter = selectedCountries.length > 0 || selectedStates.length > 0 || selectedCities.length > 0;

  // When a location filter is active, auto-select all matching branches so the
  // grid filters immediately without requiring a separate branch pick.
  // When location is cleared, clear branch selection too.
  useEffect(() => {
    if (branchesLoading) return;
    if (hasLocationFilter) {
      setSelectedBranches(branches);
    } else {
      setSelectedBranches([]);
    }
  }, [branches, hasLocationFilter, branchesLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // undefined  = no location/branch filter → fetch all leads for session org
  // []         = location filter active but no matching branches → show nothing
  // ['uuid..'] = specific branches selected → filter by those org IDs
  const orgIds = useMemo(
    () => hasLocationFilter
      ? selectedBranches.map(b => b.id)
      : selectedBranches.length > 0
        ? selectedBranches.map(b => b.id)
        : undefined,
    [selectedBranches, hasLocationFilter],
  );
  const platforms = useMemo(
    () => selectedSources.length > 0 ? selectedSources : undefined,
    [selectedSources],
  );

  const primaryBranch = selectedBranches[0] ?? branches[0] ?? null;

  const {
    leads, stats, loading, error,
    statusOptions, statusLabelMap, requiresFollowupStatuses,
    rejectionStatuses, stageOutcomes, stageIdToName,
    updateLead, refetch,
  } = useLeads(orgIds, platforms);

  const [candidates, setCandidates] = useState<SessionUser[]>([]);
  const canInlineAssign = INLINE_ASSIGN_ROLES.includes(actor.role);

  useEffect(() => {
    if (!canInlineAssign) { setCandidates([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/users/assignable', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) { if (!cancelled) setCandidates([]); return; }
        const data = (await res.json()) as { users?: SessionUser[] };
        if (cancelled) return;
        setCandidates(Array.isArray(data.users) ? data.users : []);
      } catch {
        if (!cancelled) setCandidates([]);
      }
    })();
    return () => { cancelled = true; };
  }, [canInlineAssign]);

  const handleFilterChange = (filter: CardFilter) => {
    setActiveFilter(prev => (prev === filter ? 'all' : filter));
  };

  const exportLeads = (format: ExportFormat) => {
    const rows     = applyLeadFilter(leads, activeFilter, requiresFollowupStatuses);
    const columns  = buildLeadExportColumns();
    const branchLabel = selectedBranches.length === 1
      ? selectedBranches[0].name
      : selectedBranches.length > 1
        ? `${selectedBranches.length}-branches`
        : primaryBranch?.name ?? '';
    const filename = buildFilename([
      branchLabel,
      activeFilter === 'all' ? '' : FILTER_LABELS[activeFilter],
    ]);
    exportRows(rows, columns, filename, format);
  };

  const exportableCount = applyLeadFilter(leads, activeFilter, requiresFollowupStatuses).length;

  const branchLabel = selectedBranches.length === 0
    ? (primaryBranch?.name ?? '—')
    : selectedBranches.length === 1
      ? selectedBranches[0].name
      : `${selectedBranches.length} branches`;

  return (
    <div className="flex w-full flex-1 flex-col bg-[#F8FAFC] lg:min-h-0">

      {/* Location + branch filters */}
      <LocationFilters
        countries={countries}
        states={states}
        cities={cities}
        selectedCountries={selectedCountries}
        selectedStates={selectedStates}
        selectedCities={selectedCities}
        onCountriesChange={setSelectedCountries}
        onStatesChange={setSelectedStates}
        onCitiesChange={setSelectedCities}
        loadingCountries={loadingCountries}
        loadingStates={loadingStates}
        loadingCities={loadingCities}
        branches={branches}
        selectedBranches={selectedBranches}
        onBranchesChange={setSelectedBranches}
        loadingBranches={branchesLoading}
        leadSources={leadSources}
        selectedSources={selectedSources}
        onSourcesChange={setSelectedSources}
        loadingSources={sourcesLoading}
      />

      {branchesError && (
        <div className="mx-4 mt-2 shrink-0 rounded-lg border border-orange-100 bg-orange-50 px-4 py-2 text-xs text-[#EA580C] sm:mx-5">
          Could not load branches: {branchesError}
        </div>
      )}

      {/* Stats cards */}
      <div className="shrink-0 border-b border-[#E2E8F0] bg-white">
        <StatsCards
          stats={stats}
          leads={leads}
          requiresFollowupStatuses={requiresFollowupStatuses}
          actor={actor}
          activeFilter={activeFilter}
          onFilterChange={handleFilterChange}
        />
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#E2E8F0] bg-white px-4 py-1.5 sm:px-5 sm:py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 text-sm font-semibold text-[#0F172A]">{branchLabel}</span>
          {!loading && (
            <span className="shrink-0 rounded-full border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 text-xs font-medium tabular-nums text-[#64748B]">
              {stats.serverTotal} total
            </span>
          )}
          {activeFilter !== 'all' && (
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 py-0.5 text-xs font-medium text-[#0b6cbf]">
              Showing: {FILTER_LABELS[activeFilter]}
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className="ml-0.5 transition-colors hover:text-[#1e3a5f]"
                title="Clear filter"
                aria-label="Clear filter"
              >
                ×
              </button>
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {error && (
            <span className="rounded-lg border border-orange-100 bg-orange-50 px-3 py-1.5 text-xs text-[#EA580C]">
              {error}
            </span>
          )}
          <DownloadButton onExport={exportLeads} rowCount={exportableCount} disabled={loading} />
        </div>
      </div>

      {/* Grid region */}
      <div className="flex w-full flex-1 flex-col p-2 sm:px-5 sm:py-3 lg:min-h-0 lg:overflow-hidden">
        <div className="flex w-full flex-1 flex-col rounded-xl border border-[#E2E8F0] bg-white shadow-sm lg:min-h-0 lg:overflow-hidden">
          <LeadsTable
            leads={leads}
            loading={loading || branchesLoading}
            statusFilter={activeFilter}
            onUpdate={updateLead}
            newLeadRowKeys={new Set()}
            statusOptions={statusOptions}
            statusLabelMap={statusLabelMap}
            actor={actor}
            assignmentCandidates={candidates}
            onAssignmentChanged={refetch}
            requiresFollowupStatuses={requiresFollowupStatuses}
            rejectionStatuses={rejectionStatuses}
            stageOutcomes={stageOutcomes}
            stageIdToName={stageIdToName}
          />
        </div>
      </div>
    </div>
  );
}
