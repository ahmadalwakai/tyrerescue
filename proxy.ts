import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
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
    '/tyres',
    '/faq',
    '/contact',
    '/privacy-policy',
    '/terms-of-service',
    '/refund-policy',
    '/cookie-policy',
  ];

  // Check if the route is public
  const isPublicRoute =
    publicRoutes.includes(pathname) ||
    pathname.startsWith('/tyres/') ||
    pathname.startsWith('/tracking/') ||
    pathname.startsWith('/success/') ||
    pathname.startsWith('/services/') ||
    pathname.startsWith('/reset-password/') ||
    pathname.startsWith('/verify-email/') ||
    pathname.startsWith('/api/');

  if (isPublicRoute) {
    return NextResponse.next();
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)'],
};
