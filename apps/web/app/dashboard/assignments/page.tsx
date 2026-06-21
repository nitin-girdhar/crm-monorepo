import { redirect } from 'next/navigation';
import type { SessionUser } from '@crm/types';
import type { AssignmentView } from '@/src/types/leads';
import { RANKS } from '@crm/permissions';
import { getServerSession, GATEWAY_URL } from '@/src/lib/server-session';
import AssignmentsClient from '@/components/assignments/AssignmentsClient';

export const dynamic = 'force-dynamic';

export default async function AssignmentsPage() {
  const result = await getServerSession();
  if (!result) redirect('/login?callbackUrl=%2Fdashboard%2Fassignments');
  const { session, cookieHeader } = result;
  if (session.rank < RANKS.SSE) redirect('/dashboard/leads');

  const [assignmentsRes, candidatesRes] = await Promise.all([
    fetch(`${GATEWAY_URL}/assignments`, { headers: { cookie: cookieHeader }, cache: 'no-store' }),
    fetch(`${GATEWAY_URL}/users/assignable`, { headers: { cookie: cookieHeader }, cache: 'no-store' }),
  ]);

  let assignments: AssignmentView[] = [];
  let candidates: SessionUser[] = [];
  if (assignmentsRes.ok) {
    const d = await assignmentsRes.json() as { data?: AssignmentView[] };
    assignments = Array.isArray(d.data) ? d.data : [];
  }
  if (candidatesRes.ok) {
    const d = await candidatesRes.json() as { data?: SessionUser[] };
    candidates = Array.isArray(d.data) ? d.data : [];
  }

  return (
    <AssignmentsClient
      actor={session}
      assignments={assignments}
      candidates={candidates}
    />
  );
}
