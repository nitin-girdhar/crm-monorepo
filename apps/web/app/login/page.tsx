import type { Metadata } from 'next';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { jwtVerify } from 'jose';
import { AUTH_COOKIE_NAME, JWT_ISSUER, JWT_AUDIENCE } from '@crm/auth-constants';
import LoginForm from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Sign in · FitClass CRM',
  description: 'Secure access to the FitClass lead management CRM',
};

export const dynamic = 'force-dynamic';

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

const API_GATEWAY = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

async function isAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    if (!token) return false;
    const secret = new TextEncoder().encode(process.env['JWT_SECRET']);
    await jwtVerify(token, secret, { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    // JWT is cryptographically valid — also verify the session is live with the auth service
    const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ');
    const res = await fetch(`${API_GATEWAY}/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [authed, params] = await Promise.all([
    isAuthenticated(),
    searchParams,
  ]);

  const safeCallback =
    params.callbackUrl && params.callbackUrl.startsWith('/')
      ? params.callbackUrl
      : '/dashboard/leads';

  if (authed) redirect(safeCallback);

  return (
    <div className="grid h-full w-full overflow-y-auto bg-white lg:grid-cols-2">
      {/* Brand panel — left on desktop, hidden on mobile */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0b1f3a] p-12 lg:flex">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#0b6cbf] opacity-30 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-[#1e88e5] opacity-20 blur-3xl"
          aria-hidden
        />

        <div className="relative">
          <Image
            src="/fitclass-logo-white.webp"
            alt="FitClass"
            width={220}
            height={50}
            priority
            className="h-11 w-auto object-contain"
          />
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-tight text-white">
            Centralised lead management for every FitClass branch.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Meta &amp; Website leads, real-time status syncing, branch
            transfers — secured behind your FitClass account.
          </p>
        </div>

        <p className="relative text-xs text-slate-400">
          © {new Date().getFullYear()} FitClass · Internal CRM
        </p>
      </aside>

      {/* Auth panel */}
      <section className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex justify-center lg:hidden">
            <div className="rounded-2xl bg-[#0b1f3a] px-6 py-4">
              <Image
                src="/fitclass-logo-white.webp"
                alt="FitClass"
                width={180}
                height={42}
                priority
                className="h-9 w-auto object-contain"
              />
            </div>
          </div>

          <header className="mb-8 text-center lg:text-left">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to access the FitClass leads dashboard.
            </p>
          </header>

          <LoginForm callbackUrl={safeCallback} />

          <p className="mt-8 text-center text-xs leading-relaxed text-slate-400 lg:text-left">
            Access is restricted to authorised FitClass accounts. By signing in
            you agree to FitClass internal usage policies.
          </p>
        </div>
      </section>
    </div>
  );
}
