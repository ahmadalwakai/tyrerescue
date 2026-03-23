import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, invoices, bookings } from '@/lib/db';
import { eq, and, or, ne, isNull, desc, count, max, sql } from 'drizzle-orm';

type Props = { params: Promise<{ id: string }> };

export async function GET(_request: Request, props: Props) {
  try {
    await requireAdmin();
    const { id } = await props.params;

    // Fetch the current invoice
    const [invoice] = await db
      .select({
        id: invoices.id,
        userId: invoices.userId,
        customerEmail: invoices.customerEmail,
        customerName: invoices.customerName,
      })
      .from(invoices)
      .where(eq(invoices.id, id))
      .limit(1);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Build matching conditions: prefer userId, fall back to customerEmail
    const matchConditions = invoice.userId
      ? or(
          eq(invoices.userId, invoice.userId),
          eq(invoices.customerEmail, invoice.customerEmail),
        )
      : eq(invoices.customerEmail, invoice.customerEmail);

    // Fetch other invoices for same customer (exclude current, exclude hard-deleted)
    const customerInvoices = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        totalAmount: invoices.totalAmount,
        issueDate: invoices.issueDate,
        sentAt: invoices.sentAt,
        archivedAt: invoices.archivedAt,
        deletedAt: invoices.deletedAt,
        bookingId: invoices.bookingId,
        customerName: invoices.customerName,
        customerEmail: invoices.customerEmail,
        customerPhone: invoices.customerPhone,
      })
      .from(invoices)
      .where(
        and(
          matchConditions,
          ne(invoices.id, id),
          isNull(invoices.deletedAt),
        ),
      )
      .orderBy(desc(invoices.issueDate));

    // Resolve booking refs for invoices that have bookingId
    const bookingIds = customerInvoices
      .filter((inv) => inv.bookingId)
      .map((inv) => inv.bookingId!);

    let bookingRefMap: Record<string, string> = {};
    if (bookingIds.length > 0) {
      const bookingRows = await db
        .select({ id: bookings.id, refNumber: bookings.refNumber })
        .from(bookings)
        .where(sql`${bookings.id} = ANY(${bookingIds})`);
      bookingRefMap = Object.fromEntries(
        bookingRows.map((b) => [b.id, b.refNumber]),
      );
    }

    // Customer summary stats
    const [invoiceStats] = await db
      .select({
        total: count(),
        lastDate: max(invoices.issueDate),
      })
      .from(invoices)
      .where(and(matchConditions, isNull(invoices.deletedAt)));

    // Count bookings for this customer
    const bookingMatch = invoice.userId
      ? eq(bookings.userId, invoice.userId)
      : eq(bookings.customerEmail, invoice.customerEmail);

    const [bookingStats] = await db
      .select({
        total: count(),
        lastDate: max(bookings.createdAt),
      })
      .from(bookings)
      .where(bookingMatch);

    return NextResponse.json({
      invoices: customerInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        totalAmount: inv.totalAmount?.toString() ?? '0',
        issueDate: inv.issueDate?.toISOString() ?? null,
        sentAt: inv.sentAt?.toISOString() ?? null,
        archivedAt: inv.archivedAt?.toISOString() ?? null,
        bookingId: inv.bookingId,
        bookingRef: inv.bookingId ? bookingRefMap[inv.bookingId] ?? null : null,
        customerPhone: inv.customerPhone,
      })),
      summary: {
        totalInvoices: invoiceStats?.total ?? 0,
        lastInvoiceDate: invoiceStats?.lastDate?.toISOString() ?? null,
        totalBookings: bookingStats?.total ?? 0,
        lastBookingDate: bookingStats?.lastDate?.toISOString() ?? null,
        customerName: invoice.customerName,
        customerEmail: invoice.customerEmail,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message.includes('Forbidden'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('GET /api/admin/invoices/[id]/customer-history error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
