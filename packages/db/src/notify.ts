import { serviceDb } from './client.js';

export async function pgNotify(
  channel: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = serviceDb();
  await db.notify(channel, JSON.stringify(payload));
}

export async function pgListen(
  channel: string,
  handler: (payload: string) => void,
): Promise<() => Promise<void>> {
  const db = serviceDb();
  const { unlisten } = await db.listen(channel, handler);
  return unlisten;
}
