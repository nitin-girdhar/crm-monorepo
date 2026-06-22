import { config } from '../config/index.js';

const INTERNAL_SECRET = process.env['INTERNAL_SERVICE_SECRET'] ?? '';

interface ActivityPayload {
  action_type: string;
  performed_by: string;
  subject_user_id?: string;
  old_value?: unknown;
  new_value?: unknown;
}

export async function logActivity(payload: ActivityPayload): Promise<void> {
  try {
    await fetch(`${config.activitiesServiceUrl}/api/v1/activities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': INTERNAL_SECRET,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[activity-logger] Failed to record activity:', (err as Error).message, payload.action_type);
  }
}
