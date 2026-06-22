'use client';

import { useEffect, useRef } from 'react';

const SSE_BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

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

export function useRealtimeEvents(
  currentUserId: string | undefined,
  callbacks: RealtimeCallbacks,
): void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!currentUserId) return;

    // Connect directly to the API gateway — bypasses the Next.js rewrite
    // proxy which has a 30s timeout that kills SSE connections.
    const es = new EventSource(`${SSE_BASE_URL}/notifications/stream`, { withCredentials: true });

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

    return () => {
      es.close();
    };
  }, [currentUserId]);
}
