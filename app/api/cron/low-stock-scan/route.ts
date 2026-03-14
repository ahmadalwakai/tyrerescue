import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { lte, sql } from 'drizzle-orm';
import { sendEmail } from '@/lib/email/resend';
import { adminLowStock } from '@/lib/email/templates';

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

  const adminEmail = process.env.ADMIN_EMAIL || process.env.RESEND_FROM_EMAIL || 'admin@tyrerescue.uk';

  // Send individual alerts for each low-stock item
  for (const tyre of lowStock) {
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
