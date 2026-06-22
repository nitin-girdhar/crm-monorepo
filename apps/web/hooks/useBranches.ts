'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { branches as branchesApi } from '@/src/lib/api/client';

export interface DynamicBranch {
  id: string;
  name: string;
  cityId: number | null;
  stateId: number | null;
  countryId: number | null;
}

export interface LocationFilter {
  cityIds?: number[];
  stateIds?: number[];
  countryIds?: number[];
}

interface UseBranchesReturn {
  branches: DynamicBranch[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useBranches(locationFilter?: LocationFilter): UseBranchesReturn {
  const [branches, setBranches] = useState<DynamicBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filterRef = useRef(locationFilter);
  filterRef.current = locationFilter;

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    try {
      const f = filterRef.current;
      const params: { cityIds?: string; stateIds?: string; countryIds?: string } = {};
      if (f?.cityIds?.length)    params.cityIds    = f.cityIds.join(',');
      if (f?.stateIds?.length)   params.stateIds   = f.stateIds.join(',');
      if (f?.countryIds?.length) params.countryIds  = f.countryIds.join(',');

      const json = await branchesApi.list(params);
      const raw = json.data ?? [];

      setBranches(
        raw.map((o) => ({
          id: o.id,
          name: o.name,
          cityId: o.cityId ?? o.city_id ?? null,
          stateId: o.stateId ?? o.state_id ?? null,
          countryId: o.countryId ?? o.country_id ?? null,
        })),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const filterKey = JSON.stringify(locationFilter);
  useEffect(() => {
    setBranches([]);
    fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, fetchBranches]);

  return { branches, loading, error, refresh: fetchBranches };
}
