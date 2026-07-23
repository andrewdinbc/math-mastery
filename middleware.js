// middleware.js
//
// Real kill switch, per Aj's explicit request: if a security
// vulnerability is identified, this can take the product offline
// immediately -- no redeploy needed, no waiting for a build. Checks a
// shared Supabase table (system_lockdown) on every request. Toggled
// centrally from Hyperion's own control page.
//
// Uses the anon key (read-only) rather than the service role key --
// this middleware only ever needs to READ the lockdown flag, never
// write it. Fails OPEN (allows the request through) if the check
// itself fails or env vars are missing -- a broken lockdown check must
// never silently break real traffic.

import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PRODUCT_NAME = 'math-mastery';

export async function middleware(request) {
  const path = request.nextUrl.pathname;
  if (path.startsWith('/_next') || path.startsWith('/api/lockdown-status') || path === '/favicon.ico') {
    return NextResponse.next();
  }

  if (!SUPABASE_URL || !ANON_KEY) return NextResponse.next();

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/system_lockdown?product=in.(ALL,${PRODUCT_NAME})&select=product,locked,reason`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }, signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return NextResponse.next();

    const rows = await res.json();
    const locked = rows.find(r => r.locked);
    if (!locked) return NextResponse.next();

    return new NextResponse(
      JSON.stringify({
        error: 'Temporarily unavailable',
        message: 'This service has been taken offline for security maintenance. Real student and teacher data is not affected by this page being unavailable.',
        reason: locked.reason || 'No reason provided.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '300' } }
    );
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
