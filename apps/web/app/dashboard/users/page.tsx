import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { jwtVerify } from 'jose';
import type { SessionUser } from '@crm/types';
import { AUTH_COOKIE_NAME, JWT_ISSUER, JWT_AUDIENCE } from '@crm/auth-constants';
import { RANKS } from '@crm/permissions';
import UsersClient from '@/components/users/UsersClient';

export const dynamic = 'force-dynamic';

const API_GATEWAY = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

async function getSessionAndUsers(): Promise<{ session: SessionUser; users: SessionUser[] } | null> {
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
    const [meRes, usersRes] = await Promise.all([
      fetch(`${API_GATEWAY}/auth/me`, {
        headers: { cookie: cookieHeader },
        cache: 'no-store',
      }),
      fetch(`${API_GATEWAY}/users`, {
        headers: { cookie: cookieHeader },
        cache: 'no-store',
      }),
    ]);

    if (!meRes.ok) return null;
    const meData = await meRes.json() as { user: SessionUser };

    let users: SessionUser[] = [];
    if (usersRes.ok) {
      const usersData = await usersRes.json() as { users?: SessionUser[] };
      users = Array.isArray(usersData.users) ? usersData.users : [];
    }

    return { session: meData.user, users };
  } catch {
    return null;
  }
}

export default async function UsersPage() {
  const result = await getSessionAndUsers();
  if (!result) redirect('/login?callbackUrl=%2Fdashboard%2Fusers');

  const { session, users } = result;

  if (session.rank < RANKS.SSE) {
    redirect('/dashboard/leads');
  }

  return <UsersClient users={users} actor={session} />;
}
