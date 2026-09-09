import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { demandSnapshots, visitorClicks, siteVisitors } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/security';

const VALID_EVENTS = [
  'page_view',
  'call_click',
  'whatsapp_click',
  'booking_start',
  'booking_complete',
  'booking_paid',
  'quote_started',
  'callback_submit',
] as const;
type EventType = typeof VALID_EVENTS[number];

const DEMAND_COLUMN_BY_EVENT: Partial<Record<EventType, string>> = {
  page_view: 'page_views',
  call_click: 'call_clicks',
  whatsapp_click: 'whatsapp_clicks',
  booking_start: 'booking_starts',
  booking_complete: 'booking_completes',
};

const CLICK_LABEL_BY_EVENT: Partial<Record<EventType, string>> = {
  call_click: 'Phone Call',
  whatsapp_click: 'WhatsApp',
  callback_submit: 'Call Back Request',
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const event = body.event as string;
    const sessionId = body.sessionId as string;

    if (!event || !sessionId || !VALID_EVENTS.includes(event as EventType)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const ip = getClientIp(request);
    const rl = await checkRateLimit(`analytics:${ip}:${sessionId}`, RATE_LIMITS.analyticsEvent);
    if (!rl.ok) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    // Update demand snapshot for current hour
    const hourStart = new Date();
    hourStart.setMinutes(0, 0, 0);

    const eventType = event as EventType;
    const col = DEMAND_COLUMN_BY_EVENT[eventType];

    if (col) {
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
    }

    const clickLabel = CLICK_LABEL_BY_EVENT[eventType];

    // Also record contact-intent events in visitorClicks when a visitor row exists.
    if (clickLabel) {
      const visitor = await db
        .select({ id: siteVisitors.id })
        .from(siteVisitors)
        .where(eq(siteVisitors.sessionId, sessionId))
        .limit(1);

      if (visitor.length > 0) {
        await db.insert(visitorClicks).values({
          visitorId: visitor[0].id,
          buttonText: clickLabel,
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
