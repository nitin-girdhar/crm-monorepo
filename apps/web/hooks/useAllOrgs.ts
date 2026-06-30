'use client';

import { useEffect, useState } from 'react';
import { orgs as orgsApi } from '@/src/lib/api/client';

export function useAllOrgs() {
  const [orgs, setOrgs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await orgsApi.all();
        if (cancelled) return;
        const list = Array.isArray(json.data) ? json.data : [];
        setOrgs(
          list.map((o) =>
            typeof o === 'string' ? o : (o as Record<string, unknown>).name as string ?? '',
          ).filter(Boolean),
        );
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load orgs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { orgs, loading, error };
}
