import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { canReadCompany, canWriteCompany } from '@/lib/tax-payroll/permissions';
import { db } from '@/lib/db';
import { vatPeriods } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { isPayrollDate } from '@/lib/tax-payroll/tax-month';
import type { TaxApiError } from '@/lib/tax-payroll/contracts';

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' };
const requestSchema = z.object({ periodId: z.string().uuid() }).strict();
const missingTransactions = 'VAT cannot be calculated until complete reconciled sales and purchase records are connected. No zero VAT bill or nil return has been created.';

interface RouteContext {
  params: Promise<{ companyId: string }>;
}

// GET: list VAT periods
export async function GET(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId } = await context.params;

  if (!z.string().uuid().safeParse(companyId).success) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404, headers: privateHeaders });

  if (!(await canReadCompany(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  try {
    const periods = await db
      .select()
      .from(vatPeriods)
      .where(eq(vatPeriods.companyId, companyId))
      .orderBy(desc(vatPeriods.periodEnd));

    return NextResponse.json({ periods, calculationAvailable: false, calculationStatus: 'no_data', message: missingTransactions, hmrcVerified: false }, { headers: privateHeaders });
  } catch (err) {
    console.error('[vat/periods GET]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}

// POST: calculate VAT return for a period (draft calculation)
export async function POST(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId } = await context.params;

  if (!z.string().uuid().safeParse(companyId).success) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404, headers: privateHeaders });

  if (!(await canWriteCompany(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'A valid periodId is required; transaction totals cannot be supplied without a reconciled data source.', code: 'VALIDATION_ERROR' }, { status: 422, headers: privateHeaders });

  try {
    const [period] = await db.select().from(vatPeriods)
      .where(and(eq(vatPeriods.id, parsed.data.periodId), eq(vatPeriods.companyId, companyId))).limit(1);
    if (!period) return NextResponse.json<TaxApiError>({ error: 'VAT period not found', code: 'NOT_FOUND' }, { status: 404, headers: privateHeaders });
    if (period.status !== 'open') return NextResponse.json({ error: 'This VAT period is not open for draft calculation.', code: 'VALIDATION_ERROR' }, { status: 409, headers: privateHeaders });
    if (![period.periodStart, period.periodEnd, period.dueDate].every(isPayrollDate)
      || period.periodStart > period.periodEnd || period.dueDate < period.periodEnd) {
      return NextResponse.json({ error: 'The VAT period dates must be reconciled before calculation.', code: 'VALIDATION_ERROR' }, { status: 422, headers: privateHeaders });
    }
    // Journal balances cannot identify VAT rates, recoverability, invoice dates
    // or a complete source population. Never manufacture a nil return from [].
    return NextResponse.json({ error: missingTransactions, code: 'VALIDATION_ERROR',
      calculationStatus: 'no_data', calculationAvailable: false, draft: null, hmrcVerified: false,
    }, { status: 422, headers: privateHeaders });
  } catch (err) {
    console.error('[vat/periods POST]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
