import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { adminQuoteDrafts } from '@/lib/db/schema';
import {
  authenticateAdminQuoteRequest,
  buildAdminQuotePaymentHandoff,
  buildAdminQuotePaymentSummary,
  confirmAdminQuoteSchema,
  getAdminQuoteNextAction,
  getAdminQuoteStatusForPaymentOption,
  getEffectiveAdminQuoteStatus,
  serializeAdminQuote,
} from '@/lib/admin-quotes';
import type {
  AdminQuote,
  AdminQuoteNextAction,
  AdminQuotePaymentOption,
  ConfirmAdminQuoteResponse,
} from '@/types/admin-quotes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.string().uuid() });

function validationMessage(error: z.ZodError): string {
  const flat = error.flatten();
  const fieldErrors = flat.fieldErrors as Record<string, string[] | undefined>;
  const fieldMessage = Object.entries(fieldErrors)
    .map(([field, messages]) => `${field}: ${messages?.[0] ?? 'invalid'}`)
    .join('; ');
  return flat.formErrors[0] || fieldMessage || 'Invalid request';
}

async function loadQuote(id: string) {
  const [quote] = await db
    .select()
    .from(adminQuoteDrafts)
    .where(eq(adminQuoteDrafts.id, id))
    .limit(1);
  return quote ?? null;
}

function appendOperatorNote(existing: string | null, operatorNote: string | null | undefined, confirmedAt: Date): string | null {
  const trimmed = operatorNote?.trim();
  if (!trimmed) return existing;
  const line = `[${confirmedAt.toISOString()}] Confirmation note: ${trimmed}`;
  return existing?.trim() ? `${existing.trim()}\n${line}` : line;
}

function hasStoredConfirmationState(quote: Awaited<ReturnType<typeof loadQuote>>): boolean {
  if (!quote) return false;
  return Boolean(quote.confirmedAt || quote.selectedPaymentOption || quote.quoteStatus === 'PAID');
}

function buildConfirmResponse(input: {
  quote: AdminQuote;
  requestedPaymentOption: AdminQuotePaymentOption | null;
  nextAction: AdminQuoteNextAction;
  alreadyConfirmed: boolean;
}): ConfirmAdminQuoteResponse {
  const selectedPaymentOption = input.quote.selectedPaymentOption ?? input.requestedPaymentOption;
  const paymentSummary = buildAdminQuotePaymentSummary(input.quote.priceAmount, selectedPaymentOption);
  const whatsappMessage = selectedPaymentOption
    ? input.quote.confirmationWhatsAppMessages[selectedPaymentOption]
    : input.quote.whatsappMessage;

  return {
    quote: input.quote,
    nextAction: input.nextAction,
    selectedPaymentOption,
    alreadyConfirmed: input.alreadyConfirmed,
    paymentSummary,
    whatsappMessage,
    paymentInstruction: selectedPaymentOption === 'PAYMENT_LINK' ? whatsappMessage : null,
    paymentHandoff: buildAdminQuotePaymentHandoff({
      paymentOption: selectedPaymentOption,
      quickBookingId: input.quote.quickBookingId,
    }),
  };
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

  const body = await request.json().catch(() => ({}));
  const parsed = confirmAdminQuoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: validationMessage(parsed.error), details: parsed.error.flatten() }, { status: 400 });
  }

  const quote = await loadQuote(parsedParams.data.id);
  if (!quote) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  const effectiveStatus = getEffectiveAdminQuoteStatus(quote);
  if (effectiveStatus === 'EXPIRED') {
    return NextResponse.json(
      {
        error: 'Quote has expired. Recalculate or refresh the quote before confirming.',
        nextAction: 'RECALCULATE_REQUIRED' satisfies AdminQuoteNextAction,
      },
      { status: 409 },
    );
  }
  if (effectiveStatus === 'CANCELLED') {
    return NextResponse.json({ error: 'Cancelled quote cannot be confirmed' }, { status: 409 });
  }

  const requestedPaymentOption = parsed.data.selectedPaymentOption;

  if (hasStoredConfirmationState(quote)) {
    const serialized = serializeAdminQuote(quote);
    return NextResponse.json(buildConfirmResponse({
      quote: serialized,
      requestedPaymentOption: null,
      nextAction: 'ALREADY_CONFIRMED',
      alreadyConfirmed: true,
    }));
  }

  const confirmedAt = new Date();
  const [updatedByThisRequest] = await db
    .update(adminQuoteDrafts)
    .set({
      quoteStatus: getAdminQuoteStatusForPaymentOption(requestedPaymentOption),
      confirmedAt,
      confirmationMethod: 'PHONE',
      selectedPaymentOption: requestedPaymentOption,
      internalNotes: appendOperatorNote(quote.internalNotes, parsed.data.operatorNote, confirmedAt),
      updatedAt: confirmedAt,
    })
    .where(and(
      eq(adminQuoteDrafts.id, quote.id),
      eq(adminQuoteDrafts.quoteStatus, quote.quoteStatus),
      isNull(adminQuoteDrafts.confirmedAt),
    ))
    .returning();

  const updated = updatedByThisRequest ?? await loadQuote(quote.id);
  if (!updated) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  const updatedEffectiveStatus = getEffectiveAdminQuoteStatus(updated);
  if (!updatedByThisRequest && updatedEffectiveStatus === 'EXPIRED') {
    return NextResponse.json(
      {
        error: 'Quote has expired. Recalculate or refresh the quote before confirming.',
        nextAction: 'RECALCULATE_REQUIRED' satisfies AdminQuoteNextAction,
      },
      { status: 409 },
    );
  }
  if (!updatedByThisRequest && updatedEffectiveStatus === 'CANCELLED') {
    return NextResponse.json({ error: 'Cancelled quote cannot be confirmed' }, { status: 409 });
  }

  const alreadyConfirmed = !updatedByThisRequest;
  const serialized = serializeAdminQuote(updated);

  return NextResponse.json(buildConfirmResponse({
    quote: serialized,
    requestedPaymentOption,
    nextAction: alreadyConfirmed ? 'ALREADY_CONFIRMED' : getAdminQuoteNextAction(requestedPaymentOption),
    alreadyConfirmed,
  }));
}