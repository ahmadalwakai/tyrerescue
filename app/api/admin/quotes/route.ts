import { NextResponse, type NextRequest } from 'next/server';
import { and, desc, eq, gte, ilike, inArray, lte, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { adminQuoteDrafts } from '@/lib/db/schema';
import {
  AdminQuoteError,
  adminQuoteStatusSchema,
  authenticateAdminQuoteRequest,
  buildAdminQuoteInsert,
  createAdminQuoteSchema,
  serializeAdminQuote,
} from '@/lib/admin-quotes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  phone: z.string().trim().max(30).optional(),
  quoteRef: z.string().trim().max(20).optional(),
  status: adminQuoteStatusSchema.optional(),
  todayOnly: z.enum(['true', 'false']).optional().default('false'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

function validationMessage(error: z.ZodError): string {
  const flat = error.flatten();
  const fieldErrors = flat.fieldErrors as Record<string, string[] | undefined>;
  const fieldMessage = Object.entries(fieldErrors)
    .map(([field, messages]) => `${field}: ${messages?.[0] ?? 'invalid'}`)
    .join('; ');
  return flat.formErrors[0] || fieldMessage || 'Invalid request';
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAdminQuoteRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    phone: url.searchParams.get('phone') ?? undefined,
    quoteRef: url.searchParams.get('quoteRef') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    todayOnly: url.searchParams.get('todayOnly') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  }

  const { phone, quoteRef, status, todayOnly, limit } = parsed.data;
  const conditions: SQL[] = [];

  if (phone) conditions.push(ilike(adminQuoteDrafts.customerPhone, `%${phone}%`));
  if (quoteRef) conditions.push(ilike(adminQuoteDrafts.quoteRef, `%${quoteRef}%`));
  if (todayOnly === 'true') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    conditions.push(gte(adminQuoteDrafts.createdAt, start));
  }
  if (status === 'EXPIRED') {
    conditions.push(
      and(
        lte(adminQuoteDrafts.expiresAt, new Date()),
        inArray(adminQuoteDrafts.quoteStatus, ['DRAFT', 'QUOTED', 'PAYMENT_PENDING']),
      )!,
    );
  } else if (status) {
    conditions.push(eq(adminQuoteDrafts.quoteStatus, status));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db
    .select()
    .from(adminQuoteDrafts)
    .where(where)
    .orderBy(desc(adminQuoteDrafts.createdAt))
    .limit(limit);

  return NextResponse.json({
    quotes: rows.map(serializeAdminQuote),
    limit,
  });
}

export async function POST(request: Request) {
  const auth = await authenticateAdminQuoteRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = createAdminQuoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: validationMessage(parsed.error), details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const insert = await buildAdminQuoteInsert(parsed.data, auth.session.user.id);
    const [created] = await db.insert(adminQuoteDrafts).values(insert).returning();
    return NextResponse.json({ quote: serializeAdminQuote(created) }, { status: 201 });
  } catch (error) {
    if (error instanceof AdminQuoteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[admin-quotes:create] failed', error);
    return NextResponse.json({ error: 'Failed to save quote' }, { status: 500 });
  }
}