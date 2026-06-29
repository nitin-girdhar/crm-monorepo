import { config } from '../config/index.js';

const INTERNAL_SECRET = process.env['INTERNAL_SERVICE_SECRET'] ?? '';

interface ActivityPayload {
  action_type: string;
  performed_by: string;
  subject_user_id?: string;
  old_value?: unknown;
  new_value?: unknown;
  org_id?: string;
  tenant_id?: string;
  role?: string;
}

export async function logActivity(payload: ActivityPayload): Promise<void> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Internal-Secret': INTERNAL_SECRET,
      'X-User-Id': payload.performed_by || 'system',
      'X-User-Role': payload.role || 'system',
      'X-Org-Id': payload.org_id || 'system',
    };
    if (payload.tenant_id) headers['X-Tenant-Id'] = payload.tenant_id;

    await fetch(`${config.activitiesServiceUrl}/api/v1/activities`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[activity-logger] Failed to record activity:', (err as Error).message, payload.action_type);
  }
}
