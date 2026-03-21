import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { siteVisitors } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      let lastSeenAt = new Date();

      const poll = async () => {
        if (closed) return;

        try {
          const newVisitors = await db
            .select({
              id: siteVisitors.id,
              city: siteVisitors.city,
              device: siteVisitors.device,
              browser: siteVisitors.browser,
              referrer: siteVisitors.referrer,
              createdAt: siteVisitors.createdAt,
            })
            .from(siteVisitors)
            .where(sql`${siteVisitors.createdAt} > ${lastSeenAt}`)
            .orderBy(desc(siteVisitors.createdAt))
            .limit(10);

          for (const visitor of newVisitors) {
            const data = JSON.stringify({
              id: visitor.id,
              city: visitor.city,
              device: visitor.device,
              browser: visitor.browser,
              referrer: visitor.referrer,
              timestamp: visitor.createdAt,
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }

          if (newVisitors.length > 0 && newVisitors[0].createdAt) {
            lastSeenAt = newVisitors[0].createdAt;
          }
        } catch {
          // Connection may have closed
        }

        if (!closed) {
          setTimeout(poll, 5000);
        }
      };

      // Send initial keepalive
      controller.enqueue(encoder.encode(': keepalive\n\n'));
      poll();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
