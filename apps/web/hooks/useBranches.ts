'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

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
      const params = new URLSearchParams();
      const f = filterRef.current;
      if (f?.cityIds?.length)    params.set('cityIds',    f.cityIds.join(','));
      if (f?.stateIds?.length)   params.set('stateIds',   f.stateIds.join(','));
      if (f?.countryIds?.length) params.set('countryIds', f.countryIds.join(','));

      const res = await fetch(`/api/branches?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json() as { data?: Array<{ id: string; name: string; city_id?: number | null; state_id?: number | null; country_id?: number | null; cityId?: number | null; stateId?: number | null; countryId?: number | null }> };
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
