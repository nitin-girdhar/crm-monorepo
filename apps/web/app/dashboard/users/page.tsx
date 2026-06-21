import { redirect } from 'next/navigation';
import type { SessionUser } from '@crm/types';
import { RANKS } from '@crm/permissions';
import { getServerSession, GATEWAY_URL } from '@/src/lib/server-session';
import UsersClient from '@/components/users/UsersClient';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const result = await getServerSession();
  if (!result) redirect('/login?callbackUrl=%2Fdashboard%2Fusers');
  const { session, cookieHeader } = result;
  if (session.rank < RANKS.SSE) redirect('/dashboard/leads');

  const usersRes = await fetch(`${GATEWAY_URL}/users`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });

  let users: SessionUser[] = [];
  if (usersRes.ok) {
    const usersData = await usersRes.json() as { data?: Record<string, unknown>[] };
    const raw = Array.isArray(usersData.data) ? usersData.data : [];
    users = raw.map((u) => ({
      ...u,
      name: (u.full_name ?? u.name ?? '') as string,
      role: (u.role_name ?? u.role ?? '') as SessionUser['role'],
      role_label: (u.role_label ?? '') as string,
      rank: Number(u.rank ?? 0),
      org_id: (u.org_id ?? '') as string,
      org_name: (u.org_name ?? '') as string,
      tenant_id: (u.tenant_id ?? '') as string,
      tenant_name: (u.tenant_name ?? '') as string,
      manager_name: (u.manager_name ?? null) as string | null,
    })) as SessionUser[];
  }

  return <UsersClient users={users} actor={session} />;
}
