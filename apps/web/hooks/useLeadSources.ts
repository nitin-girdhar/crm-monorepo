'use client';

import { useEffect, useState } from 'react';

export function useLeadSources() {
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/lead-sources', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: unknown) => {
        if (cancelled) return;
        // Gateway may return string[] or Array<{id, name}>
        if (Array.isArray(data)) {
          setSources(
            data.map((d) =>
              typeof d === 'string' ? d : (d as Record<string, unknown>).name as string ?? '',
            ).filter(Boolean),
          );
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { sources, loading };
}
