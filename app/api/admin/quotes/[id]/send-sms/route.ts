import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { adminQuoteDrafts } from '@/lib/db/schema';
import {
  authenticateAdminQuoteRequest,
  buildAdminQuoteWhatsAppMessage,
  serializeAdminQuote,
} from '@/lib/admin-quotes';
import { sendVoodooSms } from '@/lib/voodoo-sms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.string().uuid() });

async function loadQuote(id: string) {
  const [quote] = await db
    .select()
    .from(adminQuoteDrafts)
    .where(eq(adminQuoteDrafts.id, id))
    .limit(1);
  return quote ?? null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateAdminQuoteRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: 'Invalid quote id' }, { status: 400 });
  }

  const row = await loadQuote(parsedParams.data.id);
  if (!row) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  const quote = serializeAdminQuote(row);
  if (!quote.smsAvailable) {
    return NextResponse.json(
      { error: quote.smsUnavailableReason ?? 'SMS is not available for this quote', quote },
      { status: 400 },
    );
  }
  if (!quote.customerPhone) {
    return NextResponse.json({ error: 'Customer phone is required', quote }, { status: 400 });
  }

  const message = buildAdminQuoteWhatsAppMessage({
    quoteRef: row.quoteRef,
    priceAmount: row.priceAmount,
    quantity: row.quantity,
    tyreSize: row.tyreSize,
    expiresAt: row.expiresAt,
  });
  const result = await sendVoodooSms({ to: quote.customerPhone, message });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'SMS send failed', provider: result.provider, quote },
      { status: result.error?.includes('not configured') ? 400 : 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    provider: result.provider,
    providerMessageId: result.providerMessageId ?? null,
    quote,
  });
}