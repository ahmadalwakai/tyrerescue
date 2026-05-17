import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/* ─── Rate Limiting (in-memory, per-instance) ─── */
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;

const RATE_LIMITED_PREFIXES = [
  '/api/auth/',
  '/api/bookings/create',
  '/api/bookings/quote',
  '/api/driver/location',
];

function isRateLimited(ip: string, pathname: string): boolean {
  if (!RATE_LIMITED_PREFIXES.some((p) => pathname.startsWith(p))) return false;

  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT;
}

// Periodic cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateMap) {
    if (now > val.resetAt) rateMap.delete(key);
  }
}, 5 * 60_000);

/* ─── noindex prefixes (auth & dashboard) ─── */
const NOINDEX_PREFIXES = [
  '/login', '/register', '/forgot-password', '/reset-password', '/verify-email',
  '/dashboard', '/admin', '/driver',
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /* ─── CORS for assisted-chat-app (Expo web on :8081) ─── */
  // Narrowly scoped: only the API surface the app calls, only localhost dev
  // origins. Production origins never appear here, so behaviour is unchanged.
  const ALLOWED_DEV_ORIGINS = new Set([
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://localhost:8082',
    'http://127.0.0.1:8082',
  ]);
  const requestOrigin = request.headers.get('origin');
  const isAssistedChatApi =
    pathname.startsWith('/api/mobile/') ||
    pathname === '/api/admin/quotes' ||
    pathname.startsWith('/api/admin/quotes/') ||
    pathname === '/api/admin/quick-book' ||
    pathname.startsWith('/api/admin/quick-book/') ||
    pathname === '/api/admin/bookings' ||
    pathname.startsWith('/api/admin/bookings/') ||
    pathname === '/api/admin/drivers' ||
    pathname.startsWith('/api/admin/drivers/') ||
    (pathname.startsWith('/api/bookings/') && pathname.endsWith('/deposit')) ||
    pathname.startsWith('/api/tyres/');
  const allowOrigin =
    isAssistedChatApi && requestOrigin && ALLOWED_DEV_ORIGINS.has(requestOrigin)
      ? requestOrigin
      : null;

  if (request.method === 'OPTIONS' && isAssistedChatApi && allowOrigin) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowOrigin,
        Vary: 'Origin',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers':
          request.headers.get('access-control-request-headers') ||
          'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  function withCors<R extends NextResponse>(res: R): R {
    if (allowOrigin) {
      res.headers.set('Access-Control-Allow-Origin', allowOrigin);
      res.headers.append('Vary', 'Origin');
    }
    return res;
  }

  /* ─── Canonical host + protocol redirect (production only) ─── */
  const host = request.headers.get('host') ?? '';
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const protocol = (forwardedProto ?? request.nextUrl.protocol.replace(':', '')).toLowerCase();

  const isLocal =
    host.includes('localhost') || host.includes('127.0.0.1');
  const isPreview = host.includes('.vercel.app');

  const needsCanonicalRedirect =
    !isLocal &&
    !isPreview &&
    host.length > 0 &&
    (host !== 'www.tyrerescue.uk' || protocol !== 'https');

  if (needsCanonicalRedirect) {
    const destination = new URL(
      `https://www.tyrerescue.uk${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    return NextResponse.redirect(destination, 308);
  }

  /* ─── CSRF check on mutating API requests ─── */
  const method = request.method;
  if (
    pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
    !pathname.startsWith('/api/stripe/webhook') &&
    !allowOrigin
  ) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  /* ─── Rate limiting ─── */
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip, pathname)) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  // Get session using auth()
  const session = await auth();
  const isLoggedIn = !!session;
  const userRole = session?.user?.role;

  // Public routes - always accessible
  const publicRoutes = [
    '/',
    '/login',
    '/register',
    '/forgot-password',
    '/emergency',
    '/book',
    '/quote',
    '/pricing',
    '/pricing-faq',
    '/tyres',
    '/help',
    '/faq',
    '/contact',
    '/privacy-policy',
    '/terms-of-service',
    '/refund-policy',
    '/cookie-policy',
    '/driver-app',
  ];

  // Service SEO routes (e.g. /mobile-tyre-fitting/glasgow/govan)
  const serviceRoutes = [
    '/mobile-tyre-fitting',
    '/emergency-tyre-fitting',
    '/tyre-repair',
    '/puncture-repair',
    '/tyre-fitting',
  ];

  // Check if the route is public
  const isPublicRoute =
    publicRoutes.includes(pathname) ||
    serviceRoutes.some((route) => pathname.startsWith(route)) ||
    pathname.startsWith('/mobile-tyre-fitting-') ||
    pathname.startsWith('/tyres/') ||
    pathname.startsWith('/blog') ||
    pathname.startsWith('/compare') ||
    pathname.startsWith('/tracking') ||
    pathname.startsWith('/track/') ||
    pathname.startsWith('/locate/') ||
    pathname.startsWith('/success/') ||
    pathname.startsWith('/services/') ||
    pathname.startsWith('/reset-password/') ||
    pathname.startsWith('/verify-email/') ||
    pathname.startsWith('/api/auth/callback/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/images/') ||
    pathname.endsWith('.xml') ||
    pathname.endsWith('.txt') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.json') ||
    pathname.endsWith('.webmanifest');

  if (isPublicRoute) {
    const response = NextResponse.next();
    if (NOINDEX_PREFIXES.some((p) => pathname.startsWith(p))) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }
    return withCors(response);
  }

  // Protected routes require authentication
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin routes
  if (pathname.startsWith('/admin')) {
    if (userRole !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Driver routes
  if (pathname.startsWith('/driver')) {
    if (userRole !== 'driver' && userRole !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Dashboard routes (customer only)
  if (pathname.startsWith('/dashboard')) {
    if (userRole !== 'customer' && userRole !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  const response = NextResponse.next();
  if (NOINDEX_PREFIXES.some((p) => pathname.startsWith(p))) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)'],
};
