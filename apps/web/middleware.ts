import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import type { JwtPayload } from '@crm/types';
import { AUTH_COOKIE_NAME, JWT_ISSUER, JWT_AUDIENCE } from '@crm/auth-constants';

const PUBLIC_PATHS = new Set(['/login', '/change-password', '/api/auth/login', '/api/auth/logout']);
const PROTECTED_PREFIXES = ['/dashboard', '/api/'];

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*', '/login', '/change-password'],
};

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.has(pathname) || pathname.startsWith('/api/auth/');
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (!isProtected || isPublic) {
    return NextResponse.next();
  }

  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return redirectToLogin(request);
  }

  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    const typed = payload as unknown as JwtPayload;

    // Force password change: redirect to /change-password for all protected routes
    // except /change-password itself (already in PUBLIC_PATHS) and API auth routes.
    if (typed.force_password_change && !pathname.startsWith('/api/')) {
      const changeUrl = new URL('/change-password', request.url);
      return NextResponse.redirect(changeUrl);
    }

    return NextResponse.next();
  } catch {
    const isApiRoute = pathname.startsWith('/api/');
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return redirectToLogin(request);
  }
}

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
