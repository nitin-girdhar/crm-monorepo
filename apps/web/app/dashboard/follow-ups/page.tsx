import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { jwtVerify } from 'jose';
import type { SessionUser } from '@crm/types';
import { AUTH_COOKIE_NAME, JWT_ISSUER, JWT_AUDIENCE } from '@crm/auth-constants';
import { FollowUpPipeline } from '@/components/leads/FollowUpPipeline';

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

export default async function FollowUpsPage() {
  const actor = await getSession();
  if (!actor) redirect('/login?callbackUrl=%2Fdashboard%2Ffollow-ups');

  const isSalesRep = actor.role === 'sales_representative';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Follow-Up Pipeline</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            {isSalesRep
              ? 'Your pending and missed follow-ups'
              : 'All pending and missed follow-ups across the org'}
          </p>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-600">
          Overdue
        </h2>
        <FollowUpPipeline
          {...(isSalesRep ? { assignedRepId: actor.id } : {})}
          overdueOnly
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#64748B]">
          All Pending &amp; Missed
        </h2>
        <FollowUpPipeline {...(isSalesRep ? { assignedRepId: actor.id } : {})} />
      </div>
    </div>
  );
}
