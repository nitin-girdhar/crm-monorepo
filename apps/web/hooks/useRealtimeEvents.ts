'use client';

import { useEffect, useRef } from 'react';

interface RealtimeEvent {
  lead_id: string;
  action: string;
  actor_id: string;
}

interface FollowUpDueEvent {
  lead_id: string;
  follow_up_id: string;
  message: string;
  scheduled_at: string;
  notes: string | null;
}

export interface RealtimeCallbacks {
  onLeadCreated?: (leadId: string) => void;
  onLeadUpdated?: (leadId: string) => void;
  onLeadDeleted?: (leadId: string) => void;
  onFollowUpDue?: (data: FollowUpDueEvent) => void;
}

let cachedApiUrl: string | null = null;

async function getApiUrl(): Promise<string> {
  if (cachedApiUrl) return cachedApiUrl;
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    cachedApiUrl = data.apiUrl;
    return cachedApiUrl!;
  } catch {
    return 'http://localhost:4000';
  }
}

export function useRealtimeEvents(
  currentUserId: string | undefined,
  callbacks: RealtimeCallbacks,
): void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!currentUserId) return;

    let es: EventSource | null = null;
    let cancelled = false;

    getApiUrl().then((apiUrl) => {
      if (cancelled) return;

      es = new EventSource(`${apiUrl}/notifications/stream`, { withCredentials: true });

      es.addEventListener('lead:created', (e) => {
        const data = JSON.parse(e.data) as RealtimeEvent;
        if (data.actor_id === currentUserId) return;
        callbacksRef.current.onLeadCreated?.(data.lead_id);
      });

      es.addEventListener('lead:updated', (e) => {
        const data = JSON.parse(e.data) as RealtimeEvent;
        if (data.actor_id === currentUserId) return;
        callbacksRef.current.onLeadUpdated?.(data.lead_id);
      });

      es.addEventListener('lead:deleted', (e) => {
        const data = JSON.parse(e.data) as RealtimeEvent;
        if (data.actor_id === currentUserId) return;
        callbacksRef.current.onLeadDeleted?.(data.lead_id);
      });

      es.addEventListener('followup:due', (e) => {
        const data = JSON.parse(e.data) as FollowUpDueEvent;
        callbacksRef.current.onFollowUpDue?.(data);
      });
    });

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [currentUserId]);
}
