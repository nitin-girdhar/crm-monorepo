'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function useLeadSources() {
  const router = useRouter();
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/lead-sources', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) { router.replace('/login'); return; }
        if (!r.ok) throw new Error(`Failed to load lead sources (${r.status})`);
        const json = await r.json() as { data?: unknown };
        if (cancelled) return;
        const data = json.data;
        if (Array.isArray(data)) {
          setSources(
            data.map((d) =>
              typeof d === 'string' ? d : (d as Record<string, unknown>).name as string ?? '',
            ).filter(Boolean),
          );
        }
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load lead sources');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [router]);

  return { sources, loading, error };
}
