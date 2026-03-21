import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { lte, sql } from 'drizzle-orm';
import { sendEmail } from '@/lib/email/resend';
import { adminLowStock } from '@/lib/email/templates';
import { createAdminNotification } from '@/lib/notifications';
import { adminNotifications } from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const LOW_STOCK_THRESHOLD = 3;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const siteUrl = process.env.NEXTAUTH_URL || 'https://www.tyrerescue.uk';

  // Find products with low stock
  const lowStock = await db
    .select({
      id: tyreProducts.id,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
      stockNew: tyreProducts.stockNew,
    })
    .from(tyreProducts)
    .where(
      lte(tyreProducts.stockNew, LOW_STOCK_THRESHOLD)
    );

  const adminEmail = process.env.ADMIN_EMAIL || process.env.RESEND_FROM_EMAIL || 'support@tyrerescue.uk';

  // Send individual alerts for each low-stock item
  for (const tyre of lowStock) {
    // Deduplication: skip if already alerted in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentAlert] = await db
      .select({ id: adminNotifications.id })
      .from(adminNotifications)
      .where(
        and(
          eq(adminNotifications.type, 'stock.low'),
          eq(adminNotifications.entityId, tyre.id),
          gt(adminNotifications.createdAt, oneDayAgo)
        )
      )
      .limit(1);

    if (recentAlert) continue;

    await createAdminNotification({
      type: 'stock.low',
      title: `⚠️ Low Stock: ${tyre.brand} ${tyre.sizeDisplay}`,
      body: `${tyre.brand} ${tyre.pattern} ${tyre.sizeDisplay} — only ${tyre.stockNew ?? 0} left`,
      entityType: 'stock',
      entityId: tyre.id,
      link: '/admin/inventory',
      severity: (tyre.stockNew ?? 0) === 0 ? 'critical' : 'warning',
      metadata: { brand: tyre.brand, pattern: tyre.pattern, size: tyre.sizeDisplay, stockNew: tyre.stockNew },
    });

    const { subject, html } = adminLowStock({
      brand: tyre.brand,
      pattern: tyre.pattern,
      size: tyre.sizeDisplay,
      stockNew: tyre.stockNew ?? 0,
      inventoryUrl: `${siteUrl}/admin/inventory`,
    });

    await sendEmail({
      to: adminEmail,
      subject,
      html,
    });
  }

  return NextResponse.json({ lowStockItems: lowStock.length });
}
