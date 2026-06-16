'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LeadView } from '@crm/types';
import type { UpdatePayload, StageOption, StageOutcome } from '@/src/types/leads';
import { leads as leadsApi } from '@/src/lib/api/client';

function sortNewestFirst(list: LeadView[]): LeadView[] {
  return [...list].sort((a, b) => {
    const da = a.created_at ? new Date(a.created_at).getTime() : 0;
    const db = b.created_at ? new Date(b.created_at).getTime() : 0;
    return db - da;
  });
}

interface UseLeadsReturn {
  leads: LeadView[];
  stats: { total: number; lastUpdated: Date | null };
  loading: boolean;
  error: string | null;
  statusOptions: string[];
  statusLabelMap: Record<string, string>;
  requiresFollowupStatuses: string[];
  rejectionStatuses: string[];
  stageOutcomes: StageOutcome[];
  stageIdToName: Record<string, string>;
  updateLead: (payload: UpdatePayload) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useLeads(orgIds?: string[], platforms?: string[]): UseLeadsReturn {
  const [leads, setLeads]           = useState<LeadView[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [statusOptions, setStatusOptions]           = useState<string[]>([]);
  const [statusLabelMap, setStatusLabelMap]         = useState<Record<string, string>>({});
  const [requiresFollowupStatuses, setRequiresFollowup] = useState<string[]>([]);
  const [rejectionStatuses, setRejectionStatuses]   = useState<string[]>([]);
  const [stageOutcomes, setStageOutcomes]           = useState<StageOutcome[]>([]);
  const [stageIdToName, setStageIdToName]           = useState<Record<string, string>>({});

  const orgIdsRef        = useRef(orgIds);
  const platformsRef     = useRef(platforms);
  const stageNameToIdRef = useRef<Record<string, string>>({});
  orgIdsRef.current    = orgIds;
  platformsRef.current = platforms;

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const ids  = orgIdsRef.current;
      const plats = platformsRef.current;

      // Empty array = location filter active but no branches match → show nothing
      if (ids !== undefined && ids.length === 0) {
        setLeads([]);
        setLastUpdated(new Date());
        setError(null);
        return;
      }

      const params: Parameters<typeof leadsApi.list>[0] = {};
      if (ids?.length)   params.org_ids   = ids.join(',');
      if (plats?.length) params.platforms = plats.join(',');
      const data = await leadsApi.list(params);

      const rawStages = (data.stage_options ?? []) as StageOption[];
      const rawOutcomes = (data.stage_outcomes ?? []) as StageOutcome[];

      const opts    = rawStages.map((s) => s.name);
      const labelMap: Record<string, string> = {};
      const followup: string[] = [];
      const rejected: string[] = [];
      const idToName: Record<string, string> = {};
      const nameToId: Record<string, string> = {};

      for (const s of rawStages) {
        labelMap[s.name] = s.label;
        idToName[s.id]   = s.name;
        nameToId[s.name] = s.id;
        if (s.followup_required) followup.push(s.name);
        if (s.is_rejected)       rejected.push(s.name);
      }
      stageNameToIdRef.current = nameToId;

      setStatusOptions(opts);
      setStatusLabelMap(labelMap);
      setRequiresFollowup(followup);
      setRejectionStatuses(rejected);
      setStageOutcomes(rawOutcomes);
      setStageIdToName(idToName);
      setLeads(sortNewestFirst(data.leads));
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLeads([]);
    setLoading(true);
    setLastUpdated(null);
    fetchData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgIds?.join(','), platforms?.join(','), fetchData]);

  const updateLead = useCallback(
    async (payload: UpdatePayload) => {
      setLeads((prev) =>
        prev.map((l) =>
          l.lead_id === payload.leadId
            ? { ...l, ...(payload.field === 'stage' ? { stage: payload.value } : { metadata: { ...l.metadata, remarks: payload.value } }) }
            : l,
        ),
      );

      const patchData: Record<string, unknown> = {};
      if (payload.field === 'stage') {
        const stage_id = stageNameToIdRef.current[payload.value];
        if (stage_id) patchData.stage_id = stage_id;
        if (payload.outcomeId)      patchData.outcome_id      = payload.outcomeId;
        if (payload.outcomeComment) patchData.outcome_comment = payload.outcomeComment;
        if (payload.transitionNote) patchData.transition_note = payload.transitionNote;
      } else {
        patchData.metadata = { remarks: payload.value };
      }

      try {
        await leadsApi.update(payload.leadId, patchData);
        if (payload.field === 'stage' && payload.followUp) {
          const fu = payload.followUp;
          const fuData: Record<string, unknown> = { scheduled_at: fu.scheduledAt };
          if (fu.assignedUserId) fuData.assigned_user_id = fu.assignedUserId;
          if (fu.notes)          fuData.notes             = fu.notes;
          await leadsApi.addFollowUp(payload.leadId, fuData);
        }
      } catch (err) {
        await fetchData(true);
        throw err;
      }
    },
    [fetchData],
  );

  const refetch = useCallback(() => fetchData(true), [fetchData]);

  return {
    leads,
    stats: { total: leads.length, lastUpdated },
    loading,
    error,
    statusOptions,
    statusLabelMap,
    requiresFollowupStatuses,
    rejectionStatuses,
    stageOutcomes,
    stageIdToName,
    updateLead,
    refetch,
  };
}
