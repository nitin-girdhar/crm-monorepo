import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    apiUrl: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000',
  });
}
