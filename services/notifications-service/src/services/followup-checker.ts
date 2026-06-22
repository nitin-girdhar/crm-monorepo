import { serviceDb } from '@crm/db';
import { connectionManager } from '../connections/manager.js';
import { config } from '../config/index.js';

interface DueFollowUp {
  id: string;
  lead_id: string;
  assigned_user_id: string;
  scheduled_at: string;
  notes: string | null;
  org_id: string;
  tenant_id: string;
  lead_name: string;
}

const notifiedIds = new Set<string>();
let lastResetDate = '';

function resetIfNewDay(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastResetDate) {
    notifiedIds.clear();
    lastResetDate = today;
  }
}

async function checkDueFollowUps(): Promise<void> {
  resetIfNewDay();

  const clientCount = connectionManager.getClientCount();
  if (clientCount === 0) return;

  try {
    const db = serviceDb();
    const rows = await db`
      SELECT
        fu.id,
        fu.lead_id,
        fu.assigned_user_id,
        fu.scheduled_at,
        fu.notes,
        ml.org_id,
        COALESCE(o.tenant_id::text, '') AS tenant_id,
        COALESCE(ml.full_name, ml.first_name || ' ' || ml.last_name, 'Unknown') AS lead_name
      FROM crm.lead_follow_ups fu
      JOIN crm.marketing_leads ml ON ml.id = fu.lead_id
      JOIN entity.organizations o ON o.id = ml.org_id
      JOIN crm.follow_up_statuses fus ON fus.id = fu.status_id
      WHERE fu.scheduled_at <= NOW() + make_interval(mins => ${config.followupLookaheadMinutes})
        AND fus.name = 'pending'
        AND fu.is_deleted = false
        AND ml.is_deleted = false
    ` as unknown as DueFollowUp[];

    console.log(`[followup-checker] Found ${rows.length} due follow-ups, ${notifiedIds.size} already notified, ${clientCount} clients connected`);

    for (const row of rows) {
      if (notifiedIds.has(row.id)) continue;

      console.log(`[followup-checker] Notifying user=${row.assigned_user_id} for lead="${row.lead_name}" followup=${row.id}`);

      const sent = connectionManager.sendToUser(row.assigned_user_id, 'followup:due', {
        lead_id: row.lead_id,
        follow_up_id: row.id,
        message: `Follow-up due for ${row.lead_name}`,
        scheduled_at: row.scheduled_at,
        notes: row.notes,
      });

      if (sent) notifiedIds.add(row.id);
    }
  } catch (err) {
    console.error('[followup-checker] Error checking due follow-ups:', err);
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startFollowUpChecker(): void {
  checkDueFollowUps();
  intervalHandle = setInterval(checkDueFollowUps, config.followupCheckIntervalMs);
}

export function stopFollowUpChecker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
