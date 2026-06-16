import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { jwtVerify } from 'jose';
import type { SessionUser } from '@crm/types';
import type { AssignmentView } from '@/src/types/leads';
import { AUTH_COOKIE_NAME, JWT_ISSUER, JWT_AUDIENCE } from '@crm/auth-constants';
import AssignmentsClient from '@/components/assignments/AssignmentsClient';

export const dynamic = 'force-dynamic';

const API_GATEWAY = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

async function getPageData(): Promise<{
  session: SessionUser;
  assignments: AssignmentView[];
} | null> {
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
    const [meRes, assignmentsRes] = await Promise.all([
      fetch(`${API_GATEWAY}/auth/me`, {
        headers: { cookie: cookieHeader },
        cache: 'no-store',
      }),
      fetch(`${API_GATEWAY}/assignments/mine`, {
        headers: { cookie: cookieHeader },
        cache: 'no-store',
      }),
    ]);

    if (!meRes.ok) return null;
    const meData = await meRes.json() as { user: SessionUser };

    let assignments: AssignmentView[] = [];
    if (assignmentsRes.ok) {
      const d = await assignmentsRes.json() as { assignments?: AssignmentView[] };
      assignments = Array.isArray(d.assignments) ? d.assignments : [];
    }

    return { session: meData.user, assignments };
  } catch {
    return null;
  }
}

export default async function MyLeadsPage() {
  const data = await getPageData();
  if (!data) redirect('/login?callbackUrl=%2Fdashboard%2Fmy-leads');

  const { session, assignments } = data;

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <AssignmentsClient
        actor={session}
        assignments={assignments}
        candidates={[]}
        title="My Leads"
        subtitle={`${assignments.length} lead${assignments.length !== 1 ? 's' : ''} assigned to you`}
        hideCreate
      />
    </div>
  );
}
