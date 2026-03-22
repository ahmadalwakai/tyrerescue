import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { demandSnapshots, visitorClicks, siteVisitors } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

const VALID_EVENTS = ['page_view', 'call_click', 'whatsapp_click', 'booking_start', 'booking_complete'] as const;
type EventType = typeof VALID_EVENTS[number];

// In-memory rate limiting: max 30 req/min per session
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRate(sessionId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(sessionId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(sessionId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

// Clean map periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap) {
    if (now > v.resetAt) rateLimitMap.delete(k);
  }
}, 120_000);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const event = body.event as string;
    const sessionId = body.sessionId as string;

    if (!event || !sessionId || !VALID_EVENTS.includes(event as EventType)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (!checkRate(sessionId)) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    // Update demand snapshot for current hour
    const hourStart = new Date();
    hourStart.setMinutes(0, 0, 0);

    const columnMap: Record<EventType, string> = {
      page_view: 'page_views',
      call_click: 'call_clicks',
      whatsapp_click: 'whatsapp_clicks',
      booking_start: 'booking_starts',
      booking_complete: 'booking_completes',
    };

    const col = columnMap[event as EventType];

    // Upsert demand snapshot for current hour
    await db.execute(sql`
      INSERT INTO demand_snapshots (id, hour_start, ${sql.raw(col)})
      VALUES (gen_random_uuid(), ${hourStart}, 1)
      ON CONFLICT ((hour_start))
      DO UPDATE SET ${sql.raw(col)} = demand_snapshots.${sql.raw(col)} + 1
    `).catch(async () => {
      // Fallback: try find + update approach if ON CONFLICT doesn't match
      const existing = await db
        .select()
        .from(demandSnapshots)
        .where(eq(demandSnapshots.hourStart, hourStart))
        .limit(1);

      if (existing.length > 0) {
        await db.execute(
          sql`UPDATE demand_snapshots SET ${sql.raw(col)} = ${sql.raw(col)} + 1 WHERE id = ${existing[0].id}`
        );
      } else {
        await db.insert(demandSnapshots).values({
          hourStart,
          [toCamelCase(col)]: 1,
        });
      }
    });

    // Also record in visitorClicks for call/whatsapp events
    if (event === 'call_click' || event === 'whatsapp_click') {
      const visitor = await db
        .select({ id: siteVisitors.id })
        .from(siteVisitors)
        .where(eq(siteVisitors.sessionId, sessionId))
        .limit(1);

      if (visitor.length > 0) {
        await db.insert(visitorClicks).values({
          visitorId: visitor[0].id,
          buttonText: event === 'call_click' ? 'Phone Call' : 'WhatsApp',
          path: (body.path as string) || '/',
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

function toCamelCase(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
