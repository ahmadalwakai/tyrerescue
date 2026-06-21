import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import {
  getCustomerMobileUser,
  isInvoiceableBookingStatus,
  verifyCustomerInvoiceToken,
} from '@/app/api/mobile/customer/_lib';
import { db } from '@/lib/db';
import { bookings, bookingTyres, tyreProducts } from '@/lib/db/schema';
import { generateInvoicePdf } from '@/lib/invoice-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COMPANY = {
  name: 'Tyre Rescue',
  address: '3, 10 Gateside St, Glasgow G31 1PD',
  phone: '0141 266 0690',
  email: 'support@tyrerescue.uk',
};

type Props = { params: Promise<{ ref: string }> };

export async function GET(request: Request, props: Props) {
  try {
    const { ref } = await props.params;
    const refNumber = ref.trim().toUpperCase();

    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.refNumber, refNumber))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (!isInvoiceableBookingStatus(booking.status)) {
      return NextResponse.json({ error: 'Invoice is available after payment.' }, { status: 409 });
    }

    const user = await getCustomerMobileUser(request);
    const url = new URL(request.url);
    const invoiceToken = url.searchParams.get('token');
    let allowed = Boolean(user && booking.userId === user.id);

    if (!allowed && invoiceToken) {
      try {
        const payload = await verifyCustomerInvoiceToken(invoiceToken);
        allowed =
          payload.bookingId === booking.id &&
          payload.refNumber === booking.refNumber &&
          payload.email.toLowerCase() === booking.customerEmail.toLowerCase();
      } catch {
        allowed = false;
      }
    }

    if (!allowed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const items = await buildInvoiceItems(booking.id, {
      quantity: booking.quantity,
      subtotal: Number(booking.subtotal),
      tyreSizeDisplay: booking.tyreSizeDisplay,
      serviceType: booking.serviceType,
      priceSnapshot: booking.priceSnapshot,
    });
    const issueDate = booking.createdAt ?? new Date();

    const pdfBytes = await generateInvoicePdf({
      invoiceNumber: `INV-${booking.refNumber}`,
      issueDate: issueDate.toISOString(),
      dueDate: issueDate.toISOString(),
      status: 'paid',
      companyName: COMPANY.name,
      companyAddress: COMPANY.address,
      companyPhone: COMPANY.phone,
      companyEmail: COMPANY.email,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone,
      customerAddress: booking.addressLine,
      items,
      subtotal: Number(booking.subtotal),
      vatAmount: Number(booking.vatAmount),
      totalAmount: Number(booking.totalAmount),
      notes: `Booking reference: ${booking.refNumber}`,
    });

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="INV-${booking.refNumber}.pdf"`,
        'Content-Length': String(pdfBytes.length),
      },
    });
  } catch (error) {
    console.error('[mobile-customer:invoice] error:', error);
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 });
  }
}

async function buildInvoiceItems(
  bookingId: string,
  fallback: {
    quantity: number;
    subtotal: number;
    tyreSizeDisplay: string | null;
    serviceType: string;
    priceSnapshot: unknown;
  },
) {
  const tyreRows = await db
    .select({
      quantity: bookingTyres.quantity,
      unitPrice: bookingTyres.unitPrice,
      service: bookingTyres.service,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
    })
    .from(bookingTyres)
    .leftJoin(tyreProducts, eq(bookingTyres.tyreId, tyreProducts.id))
    .where(eq(bookingTyres.bookingId, bookingId));

  if (tyreRows.length > 0) {
    return tyreRows.map((row) => {
      const quantity = row.quantity || 1;
      const unitPrice = Number(row.unitPrice);
      const tyreName = [row.brand, row.pattern, row.sizeDisplay].filter(Boolean).join(' ');
      return {
        description: tyreName || humanServiceLabel(row.service),
        quantity,
        unitPrice,
        totalPrice: unitPrice * quantity,
      };
    });
  }

  const snapshot = fallback.priceSnapshot as {
    lineItems?: { label?: string; amount?: number }[];
  } | null;
  const lineItems = snapshot?.lineItems?.filter((item) => Number(item.amount) > 0) ?? [];
  if (lineItems.length > 0) {
    return lineItems.map((item) => ({
      description: item.label || humanServiceLabel(fallback.serviceType),
      quantity: 1,
      unitPrice: Number(item.amount),
      totalPrice: Number(item.amount),
    }));
  }

  const quantity = Math.max(1, fallback.quantity || 1);
  return [
    {
      description: fallback.tyreSizeDisplay
        ? `${humanServiceLabel(fallback.serviceType)} - ${fallback.tyreSizeDisplay}`
        : humanServiceLabel(fallback.serviceType),
      quantity,
      unitPrice: fallback.subtotal / quantity,
      totalPrice: fallback.subtotal,
    },
  ];
}

function humanServiceLabel(value: string | null | undefined) {
  return String(value || 'Tyre service')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
