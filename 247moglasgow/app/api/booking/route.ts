import { NextResponse } from 'next/server';
import { z } from 'zod';

const bookingSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  phone: z.string().trim().min(7, 'Phone is required'),
  email: z.preprocess(
    (value) => (typeof value === 'string' && value.trim().length ? value.trim() : undefined),
    z.string().email().optional(),
  ),
  service: z.string().trim().min(2, 'Service is required'),
  location: z.string().trim().min(5, 'Location is required'),
  message: z.string().trim().max(2000).optional().default(''),
});

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const apiBase = process.env.TYRE_RESCUE_API_BASE?.replace(/\/+$/, '');
  const secret = process.env.MO_GLASGOW_INTEGRATION_SECRET?.trim();

  if (!apiBase || !secret) {
    return NextResponse.json({ error: 'Booking integration is not configured' }, { status: 500 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = bookingSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid booking request' }, { status: 400 });
  }

  const booking = parsed.data;
  const upstream = await fetch(`${apiBase}/api/integrations/projects/bookings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      'x-integration-key': secret,
      'x-source-app': '247_mo_glasgow',
    },
    body: JSON.stringify({
      sourceApp: '247_mo_glasgow',
      customerName: booking.name,
      customerPhone: booking.phone,
      customerEmail: booking.email,
      serviceType: booking.service,
      address: booking.location,
      notes: booking.message,
    }),
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Booking backend unavailable';
    return NextResponse.json({ error: message }, { status: 502 });
  });

  if (upstream instanceof NextResponse) {
    return upstream;
  }

  if (!upstream.ok) {
    const detail = await upstream.json().catch(async () => ({ error: await upstream.text().catch(() => '') }));
    const error = typeof detail?.error === 'string' && detail.error ? detail.error : 'Booking handoff failed';
    return NextResponse.json({ error }, { status: upstream.status || 502 });
  }

  return NextResponse.json({ success: true });
}
