import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { jwtVerify } from 'jose';
import type { SessionUser } from '@crm/types';
import { AUTH_COOKIE_NAME, JWT_ISSUER, JWT_AUDIENCE } from '@crm/auth-constants';
import { RANKS } from '@crm/permissions';
import AnalyticsClient from '@/components/analytics/AnalyticsClient';

export const dynamic = 'force-dynamic';

const API_GATEWAY = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(process.env['JWT_SECRET']);
    await jwtVerify(token, secret, { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
  } catch {
    return null;
  }

  const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ');
  try {
    const res = await fetch(`${API_GATEWAY}/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json() as { user: SessionUser };
    return data.user;
  } catch {
    return null;
  }
}

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session) redirect('/login?callbackUrl=%2Fdashboard%2Fanalytics');
  if (session.rank < RANKS.ADMIN) redirect('/dashboard/leads');

  return <AnalyticsClient actorRank={session.rank} orgId={session.org_id} />;
}
