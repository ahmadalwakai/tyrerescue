import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { adminQuoteDrafts } from '@/lib/db/schema';
import {
  AdminQuoteError,
  authenticateAdminQuoteRequest,
  buildAdminQuoteUpdate,
  serializeAdminQuote,
  updateAdminQuoteSchema,
} from '@/lib/admin-quotes';

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

export async function GET(
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

  const quote = await loadQuote(parsedParams.data.id);
  if (!quote) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  return NextResponse.json({ quote: serializeAdminQuote(quote) });
}

export async function PATCH(
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

  const body = await request.json().catch(() => null);
  const parsed = updateAdminQuoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: validationMessage(parsed.error), details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await loadQuote(parsedParams.data.id);
  if (!existing) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  try {
    const update = await buildAdminQuoteUpdate(parsed.data, existing);
    await db
      .update(adminQuoteDrafts)
      .set(update)
      .where(eq(adminQuoteDrafts.id, existing.id));

    const updated = await loadQuote(existing.id);
    if (!updated) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }
    return NextResponse.json({ quote: serializeAdminQuote(updated) });
  } catch (error) {
    if (error instanceof AdminQuoteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[admin-quotes:update] failed', error);
    return NextResponse.json({ error: 'Failed to update quote' }, { status: 500 });
  }
}