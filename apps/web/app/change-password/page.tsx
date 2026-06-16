import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { jwtVerify } from 'jose';
import type { SessionUser } from '@crm/types';
import { AUTH_COOKIE_NAME, JWT_ISSUER, JWT_AUDIENCE } from '@crm/auth-constants';
import ChangePasswordForm from '@/components/auth/ChangePasswordForm';

export const dynamic = 'force-dynamic';

const API_GATEWAY = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(process.env['JWT_SECRET']);
    await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch {
    return null;
  }
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
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

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect('/login?callbackUrl=%2Fchange-password');

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#F8FAFC] px-4 py-12">
      <div className="w-full max-w-sm">
        <header className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-tight text-[#0F172A]">
            {session.force_password_change ? 'Set a new password' : 'Change password'}
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            {session.force_password_change
              ? 'Your password was reset by an administrator. Choose a new one to continue.'
              : 'Update the password for your account.'}
          </p>
        </header>
        <ChangePasswordForm forced={session.force_password_change} />
      </div>
    </div>
  );
}
