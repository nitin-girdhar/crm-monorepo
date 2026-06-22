'use client';

import { useEffect, useState } from 'react';
import { branches as branchesApi } from '@/src/lib/api/client';

export function useAllBranches() {
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await branchesApi.all();
        if (cancelled) return;
        const list = Array.isArray(json.data) ? json.data : [];
        setBranches(
          list.map((b) =>
            typeof b === 'string' ? b : (b as Record<string, unknown>).name as string ?? '',
          ).filter(Boolean),
        );
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load branches');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { branches, loading, error };
}
