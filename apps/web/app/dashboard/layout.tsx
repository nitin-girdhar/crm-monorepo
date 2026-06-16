import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { jwtVerify } from 'jose';
import type { JwtPayload, SessionUser } from '@crm/types';
import { AUTH_COOKIE_NAME, JWT_ISSUER, JWT_AUDIENCE } from '@crm/auth-constants';
import DashboardNavbar from '@/components/dashboard/DashboardNavbar';
import DashboardSidebar from '@/components/dashboard/DashboardSidebar';
import SidebarController from '@/components/dashboard/SidebarController';

export const dynamic = 'force-dynamic';

const API_GATEWAY = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

async function getJwtPayload(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(process.env['JWT_SECRET']);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

async function getFullSession(cookieHeader: string): Promise<SessionUser | null> {
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

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const jwtPayload = await getJwtPayload();
  if (!jwtPayload) redirect('/login?callbackUrl=%2Fdashboard');

  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const session = await getFullSession(cookieHeader);
  if (!session) redirect('/login?callbackUrl=%2Fdashboard');

  if (session.force_password_change) {
    redirect('/change-password');
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#F8FAFC] lg:h-full lg:min-h-0 lg:overflow-hidden">
      <DashboardNavbar user={session} />
      <SidebarController role={session.role} />
      <div className="flex w-full flex-1 lg:min-h-0 lg:overflow-hidden">
        <DashboardSidebar role={session.role} />
        <main className="flex w-full min-w-0 flex-1 flex-col lg:overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
