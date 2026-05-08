import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Protected on-demand revalidation endpoint for SEO content updates.
 *
 * Auth: requires `x-revalidate-secret` header matching `REVALIDATE_SECRET`
 * env var. The secret is checked BEFORE any other work and the body is not
 * parsed if auth fails, to keep the endpoint cheap to reject.
 *
 * Allowed paths: only public, indexable SEO routes. Anything that touches
 * admin, auth, customer accounts, checkout, payment, Stripe, or any private
 * API path is rejected.
 *
 * Usage:
 *   POST /api/revalidate
 *   Headers: x-revalidate-secret: <secret>
 *   Body:    { "path": "/mobile-tyre-fitting/glasgow", "type": "page" }
 *   Or:      { "paths": ["/blog/foo", "/blog/bar"] }
 */

const ALLOWED_LITERAL_PATHS = new Set<string>([
  '/',
  '/emergency',
  '/book',
  '/tyres',
  '/pricing',
  '/pricing-faq',
  '/faq',
  '/contact',
  '/blog',
  '/compare',
  '/services',
]);

const ALLOWED_PREFIXES: readonly string[] = [
  '/mobile-tyre-fitting/',
  '/emergency-tyre-fitting/',
  '/tyre-repair/',
  '/puncture-repair/',
  '/tyre-fitting/',
  '/services/',
  '/mobile-tyre-fitting-', // /mobile-tyre-fitting-{city}-price
  '/blog/',
  '/compare/',
  '/tyres/',
];

const FORBIDDEN_SEGMENTS: readonly string[] = [
  '/admin',
  '/api',
  '/auth',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/dashboard',
  '/driver',
  '/tracking',
  '/quote',
  '/success',
  '/checkout',
  '/payment',
  '/stripe',
  '/account',
];

function isPathAllowed(path: string): boolean {
  if (typeof path !== 'string') return false;
  if (path.length === 0 || path.length > 512) return false;
  if (!path.startsWith('/')) return false;
  if (path.includes('?') || path.includes('#') || path.includes('..')) return false;

  const lower = path.toLowerCase();
  for (const blocked of FORBIDDEN_SEGMENTS) {
    if (lower === blocked || lower.startsWith(`${blocked}/`)) return false;
  }

  if (ALLOWED_LITERAL_PATHS.has(path)) return true;
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

const BodySchema = z
  .object({
    path: z.string().min(1).max(512).optional(),
    paths: z.array(z.string().min(1).max(512)).max(50).optional(),
    type: z.enum(['page', 'layout']).optional(),
  })
  .refine((b) => Boolean(b.path || (b.paths && b.paths.length > 0)), {
    message: 'Either `path` or non-empty `paths` is required',
  });

export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'revalidation disabled' },
      { status: 503 },
    );
  }

  const provided = req.headers.get('x-revalidate-secret');
  if (!provided || provided !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    const json = await req.json();
    parsed = BodySchema.parse(json);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
  }

  const candidates: string[] = parsed.paths ?? (parsed.path ? [parsed.path] : []);
  const accepted: string[] = [];
  const rejected: string[] = [];

  for (const p of candidates) {
    if (isPathAllowed(p)) {
      try {
        if (parsed.type) {
          revalidatePath(p, parsed.type);
        } else {
          revalidatePath(p);
        }
        accepted.push(p);
      } catch {
        rejected.push(p);
      }
    } else {
      rejected.push(p);
    }
  }

  if (accepted.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'no allowed paths', rejected },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, revalidated: accepted, rejected });
}

// Block any other method explicitly so misuse is loud.
export function GET() {
  return NextResponse.json({ ok: false, error: 'method not allowed' }, { status: 405 });
}
