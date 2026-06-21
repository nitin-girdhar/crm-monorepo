'use client';

import { useEffect, useState } from 'react';

export function useAllBranches() {
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/branches/all', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as { data?: unknown };
        if (cancelled) return;
        const list = Array.isArray(json.data) ? json.data : [];
        setBranches(
          (Array.isArray(list) ? list : []).map((b) =>
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
