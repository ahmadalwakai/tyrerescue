import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { or, lte, sql } from 'drizzle-orm';
import { sendEmail } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

const LOW_STOCK_THRESHOLD = 3;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find products with low stock
  const lowStock = await db
    .select({
      id: tyreProducts.id,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
      stockNew: tyreProducts.stockNew,
      stockUsed: tyreProducts.stockUsed,
    })
    .from(tyreProducts)
    .where(
      or(
        lte(tyreProducts.stockNew, LOW_STOCK_THRESHOLD),
        lte(tyreProducts.stockUsed, LOW_STOCK_THRESHOLD)
      )
    );

  if (lowStock.length > 0) {
    const rows = lowStock
      .map(
        (t) =>
          `<tr><td>${t.brand} ${t.pattern}</td><td>${t.sizeDisplay}</td><td>${t.stockNew ?? 0}</td><td>${t.stockUsed ?? 0}</td></tr>`
      )
      .join('');

    const adminEmail = process.env.ADMIN_EMAIL || process.env.RESEND_FROM_EMAIL || 'admin@tyrerescue.uk';

    await sendEmail({
      to: adminEmail,
      subject: `Low Stock Alert: ${lowStock.length} product(s) below threshold`,
      html: `<h2>Low Stock Alert</h2><table border="1" cellpadding="6"><tr><th>Product</th><th>Size</th><th>New</th><th>Used</th></tr>${rows}</table>`,
    });
  }

  return NextResponse.json({ lowStockItems: lowStock.length });
}
