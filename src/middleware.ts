/**
 * Route protection middleware.
 *
 * PUBLIC  : /booking (online client-side booking) + /admin-login + the APIs the
 *           public booking page needs.
 * PROTECTED: everything else (all admin pages + all admin APIs) — requires a
 *           valid signed admin session cookie.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, ADMIN_COOKIE } from '@/lib/adminSession';

/* Pages anyone can open without logging in */
const PUBLIC_PAGES = ['/booking', '/admin-login', '/login', '/register', '/forgot-password'];

/* API routes the public booking flow needs (method-aware) */
const PUBLIC_API: { path: string; methods: string[] }[] = [
  { path: '/api/booking-catalog',       methods: ['GET'] },
  { path: '/api/bookings',              methods: ['POST'] },
  { path: '/api/bookings/availability', methods: ['GET'] },
  { path: '/api/auth/admin-login',      methods: ['POST'] },
  { path: '/api/auth/admin-logout',     methods: ['GET', 'POST'] },
  /* Customer (booking) authentication */
  { path: '/api/auth/login',                  methods: ['POST'] },
  { path: '/api/auth/register',               methods: ['POST'] },
  { path: '/api/auth/customer-me',            methods: ['GET'] },
  { path: '/api/auth/customer-logout',        methods: ['GET', 'POST'] },
  { path: '/api/auth/forgot-password/send-otp', methods: ['POST'] },
  { path: '/api/auth/forgot-password/reset',    methods: ['POST'] },
];

async function hasValidSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const payload = await verifyAdminToken(token);
  return payload !== null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  /* ── API routes ── */
  if (pathname.startsWith('/api')) {
    const pub = PUBLIC_API.find(p => p.path === pathname && p.methods.includes(req.method));
    if (pub) return NextResponse.next();

    if (await hasValidSession(req)) return NextResponse.next();
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  /* ── Pages ── */
  if (PUBLIC_PAGES.includes(pathname)) return NextResponse.next();

  if (await hasValidSession(req)) return NextResponse.next();

  const loginUrl = new URL('/admin-login', req.url);
  loginUrl.searchParams.set('next', pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /* Skip Next internals + static assets */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|txt|woff|woff2|mp3|mp4)$).*)',
  ],
};
