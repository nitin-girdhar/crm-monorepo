import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { AUTH_COOKIE_NAME, JWT_ISSUER, JWT_AUDIENCE } from '@crm/auth-constants';

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/logout']);
const PROTECTED_PREFIXES = ['/dashboard', '/api/'];

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*', '/login'],
};

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.has(pathname) || pathname.startsWith('/api/auth/');
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (!isProtected || isPublic) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return redirectToLogin(request);
  }

  try {
    const secret = new TextEncoder().encode(process.env['JWT_SECRET']);
    await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
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
