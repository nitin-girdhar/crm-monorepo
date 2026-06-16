import { config } from './config.js';

interface ActivityPayload {
  action_type: string;
  performed_by: string;
  subject_user_id?: string;
  lead_id?: string;
  old_value?: unknown;
  new_value?: unknown;
}

export async function logActivity(payload: ActivityPayload): Promise<void> {
  try {
    await fetch(`${config.activitiesServiceUrl}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Request': '1' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Activity logging must never crash the caller, but failures must be visible in logs.
    console.error('[activity-logger] Failed to record activity:', (err as Error).message, payload.action_type);
  }
}
