import { pgNotify } from '@crm/db';

const CHANNEL = 'crm_events';

export async function publishEvent(
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await pgNotify(CHANNEL, { type: topic, ...payload, ts: Date.now() });
  } catch (err) {
    console.error('[publishEvent] NOTIFY failed:', err);
  }
}
