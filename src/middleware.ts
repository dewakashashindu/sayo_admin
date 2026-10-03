import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, ADMIN_COOKIE } from '@/lib/adminSession';

/* Pages anyone can open without logging in */
const PUBLIC_PAGES = [
  '/booking',
  '/admin-login',
  /* the staff "Forgot password" screen — it is reached from /admin-login and
     the person using it is by definition not signed in yet. Without this line
     the link did a loop:  /admin-login/forgot-password → /admin-login?next=… */
  '/admin-login/forgot-password',
  '/login',
  '/register',
  '/forgot-password',
];

/* API routes the public booking flow needs (method-aware) */
const PUBLIC_API: { path: string; methods: string[] }[] = [
  /* Database health — must stay public: when the database is unreachable
     nobody can sign in, and this is the page that explains why. It never
     returns the password, only host / database / user and the error. */
  { path: '/api/health',                methods: ['GET'] },
  { path: '/api/booking-catalog',       methods: ['GET'] },
  { path: '/api/bookings',              methods: ['POST'] },
  { path: '/api/bookings/availability', methods: ['GET'] },
  { path: '/api/bookings/hours',        methods: ['GET'] },
  { path: '/api/auth/admin-login',      methods: ['POST'] },
  /* Step 2 of the super administrator's sign-in. Public on purpose: the caller
     has no session yet — the signed challenge in the body is what proves the
     password step already happened. Nothing is handed back without a valid,
     unexpired code. */
  { path: '/api/auth/admin-login/verify-otp', methods: ['POST'] },
  { path: '/api/auth/admin-login/resend-otp', methods: ['POST'] },
  { path: '/api/auth/admin-logout',     methods: ['GET', 'POST'] },
  /* staff (tbl_userdetails) password reset — username + OTP to the saved phone
     number / e-mail. Same reason as the page above: the caller has no session. */
  { path: '/api/auth/forgot-password',        methods: ['POST'] },
  { path: '/api/auth/reset-password',         methods: ['POST'] },
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

    if (pathname.startsWith('/api')) {
    const pub = PUBLIC_API.find(p => p.path === pathname && p.methods.includes(req.method));
    if (pub) return NextResponse.next();

    if (await hasValidSession(req)) return NextResponse.next();
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
