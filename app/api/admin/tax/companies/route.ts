import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { createCompanySchema, flattenZodErrors } from '@/lib/tax-payroll/validation';
import {
  createCompany,
  getCompaniesByUserId,
  CompanyServiceError,
} from '@/lib/tax-payroll/company-service';
import type { TaxApiError, CompanyListDto } from '@/lib/tax-payroll/contracts';

// GET /api/admin/tax/companies
// Returns companies accessible to the authenticated admin and whether they
// can create a new one. An admin with no companies yet gets an empty list
// and canCreate: true.
export async function GET(request: Request) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    const body: TaxApiError = { error: 'Unauthorized', code: 'UNAUTHENTICATED' };
    return NextResponse.json(body, { status: 401 });
  }

  try {
    const companies = await getCompaniesByUserId(session.user.id);
    const body: CompanyListDto = {
      companies,
      // Any authenticated admin may create a company.
      canCreate: true,
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    console.error('[tax/companies GET]', err);
    const body: TaxApiError = { error: 'Internal server error', code: 'INTERNAL' };
    return NextResponse.json(body, { status: 500 });
  }
}

// POST /api/admin/tax/companies
// Explicitly creates the company and grants the requesting admin founder
// membership. Rejects duplicate company numbers with 409.
export async function POST(request: Request) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    const body: TaxApiError = { error: 'Unauthorized', code: 'UNAUTHENTICATED' };
    return NextResponse.json(body, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    const body: TaxApiError = { error: 'Invalid JSON body', code: 'VALIDATION_ERROR' };
    return NextResponse.json(body, { status: 400 });
  }

  const parsed = createCompanySchema.safeParse(raw);
  if (!parsed.success) {
    const body: TaxApiError = {
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      fieldErrors: flattenZodErrors(parsed.error),
    };
    return NextResponse.json(body, { status: 422 });
  }

  try {
    const company = await createCompany(session.user.id, parsed.data);
    return NextResponse.json(company, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof CompanyServiceError) {
      if (err.code === 'CONFLICT_DUPLICATE') {
        const body: TaxApiError = {
          error: err.message,
          code: 'CONFLICT_DUPLICATE',
          fieldErrors: { companyNumber: err.message },
        };
        return NextResponse.json(body, { status: 409 });
      }
    }
    console.error('[tax/companies POST]', err);
    const body: TaxApiError = { error: 'Internal server error', code: 'INTERNAL' };
    return NextResponse.json(body, { status: 500 });
  }
}
