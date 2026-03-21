import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { siteVisitors, visitorPageViews, visitorClicks } from '@/lib/db/schema';
import { eq, sql, and, ne } from 'drizzle-orm';
import { createHash } from 'crypto';

// Simple in-memory rate limiter: max 60 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 60;
}

// In-memory geo cache to avoid repeated lookups
const geoCache = new Map<string, { city: string; country: string }>();

async function geoLookup(ip: string): Promise<{ city: string; country: string }> {
  if (geoCache.has(ip)) return geoCache.get(ip)!;

  // Skip private/localhost IPs
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { city: 'Local', country: 'UK' };
  }

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=city,country`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      const result = { city: data.city || 'Unknown', country: data.country || 'UK' };
      geoCache.set(ip, result);
      // Evict cache if too large
      if (geoCache.size > 10_000) {
        const firstKey = geoCache.keys().next().value;
        if (firstKey) geoCache.delete(firstKey);
      }
      return result;
    }
  } catch { /* fallback */ }
  return { city: 'Unknown', country: 'UK' };
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip + (process.env.AUTH_SECRET || '')).digest('hex').slice(0, 16);
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '0.0.0.0';

    if (isRateLimited(ip)) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
    }

    const body = await request.json();
    const { sessionId, path, title, buttonText, device, browser, referrer, searchEngine, searchKeyword, exiting } = body;

    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    // Handle exit event
    if (exiting) {
      await db
        .update(siteVisitors)
        .set({ exitedAt: new Date(), isOnline: false, updatedAt: new Date() })
        .where(eq(siteVisitors.sessionId, sessionId));
      return NextResponse.json({ success: true });
    }

    if (!path || typeof path !== 'string' || path.length > 500) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const ipHash = hashIp(ip);
    const geo = await geoLookup(ip);

    // Upsert visitor
    const existing = await db
      .select({ id: siteVisitors.id })
      .from(siteVisitors)
      .where(eq(siteVisitors.sessionId, sessionId))
      .limit(1);

    let visitorId: string;

    if (existing.length > 0) {
      visitorId = existing[0].id;
      await db
        .update(siteVisitors)
        .set({
          isOnline: true,
          lastHeartbeat: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(siteVisitors.id, visitorId));
    } else {
      // Count previous visits by this IP
      const priorVisits = await db
        .select({
          count: sql<number>`count(*)::int`,
          dates: sql<string[]>`array_agg(${siteVisitors.createdAt}::text ORDER BY ${siteVisitors.createdAt} DESC)`,
        })
        .from(siteVisitors)
        .where(and(eq(siteVisitors.ipHash, ipHash), ne(siteVisitors.sessionId, sessionId)));

      const visitCount = (priorVisits[0]?.count || 0) + 1;
      const previousVisits = priorVisits[0]?.dates?.filter(Boolean) || [];

      const [inserted] = await db
        .insert(siteVisitors)
        .values({
          sessionId,
          ipHash,
          city: geo.city,
          country: geo.country,
          device: typeof device === 'string' ? device.slice(0, 20) : null,
          browser: typeof browser === 'string' ? browser.slice(0, 50) : null,
          referrer: typeof referrer === 'string' ? referrer.slice(0, 255) : null,
          searchEngine: typeof searchEngine === 'string' ? searchEngine.slice(0, 50) : null,
          searchKeyword: typeof searchKeyword === 'string' ? searchKeyword.slice(0, 500) : null,
          visitCount,
          previousVisits: previousVisits.length > 0 ? previousVisits : null,
        })
        .returning({ id: siteVisitors.id });
      visitorId = inserted.id;
    }

    // Record page view (unless this is a click-only event)
    if (!buttonText) {
      await db.insert(visitorPageViews).values({
        visitorId,
        path: path.slice(0, 500),
        title: typeof title === 'string' ? title.slice(0, 255) : null,
      });
    }

    // Record click
    if (buttonText && typeof buttonText === 'string') {
      await db.insert(visitorClicks).values({
        visitorId,
        buttonText: buttonText.slice(0, 255),
        path: path.slice(0, 500),
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
