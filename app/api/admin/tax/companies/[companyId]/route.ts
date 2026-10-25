import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { updateCompanySchema, flattenZodErrors } from '@/lib/tax-payroll/validation';
import {
  getCompanyById,
  updateCompany,
  CompanyServiceError,
} from '@/lib/tax-payroll/company-service';
import { canReadCompany, canWriteCompany } from '@/lib/tax-payroll/permissions';
import type { TaxApiError } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string }>;
}

// GET /api/admin/tax/companies/[companyId]
// Returns the company profile for an authorised member.
export async function GET(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    const body: TaxApiError = { error: 'Unauthorized', code: 'UNAUTHENTICATED' };
    return NextResponse.json(body, { status: 401 });
  }

  const { companyId } = await context.params;

  const allowed = await canReadCompany(session.user.id, companyId);
  if (!allowed) {
    // Return 404 instead of 403 to avoid leaking company existence
    const body: TaxApiError = { error: 'Not found', code: 'NOT_FOUND' };
    return NextResponse.json(body, { status: 404 });
  }

  try {
    const company = await getCompanyById(companyId);
    if (!company) {
      const body: TaxApiError = { error: 'Not found', code: 'NOT_FOUND' };
      return NextResponse.json(body, { status: 404 });
    }
    return NextResponse.json(company);
  } catch (err) {
    console.error('[tax/companies GET by id]', err);
    const body: TaxApiError = { error: 'Internal server error', code: 'INTERNAL' };
    return NextResponse.json(body, { status: 500 });
  }
}

// PATCH /api/admin/tax/companies/[companyId]
// Updates permitted profile fields using optimistic concurrency (expectedVersion).
// Returns the updated profile on success, 409 on version conflict.
export async function PATCH(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    const body: TaxApiError = { error: 'Unauthorized', code: 'UNAUTHENTICATED' };
    return NextResponse.json(body, { status: 401 });
  }

  const { companyId } = await context.params;

  const allowed = await canWriteCompany(session.user.id, companyId);
  if (!allowed) {
    const body: TaxApiError = { error: 'Not found', code: 'NOT_FOUND' };
    return NextResponse.json(body, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    const body: TaxApiError = { error: 'Invalid JSON body', code: 'VALIDATION_ERROR' };
    return NextResponse.json(body, { status: 400 });
  }

  const parsed = updateCompanySchema.safeParse(raw);
  if (!parsed.success) {
    const body: TaxApiError = {
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      fieldErrors: flattenZodErrors(parsed.error),
    };
    return NextResponse.json(body, { status: 422 });
  }

  try {
    const updated = await updateCompany(session.user.id, companyId, parsed.data);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof CompanyServiceError) {
      if (err.code === 'CONFLICT_VERSION') {
        const body: TaxApiError = { error: err.message, code: 'CONFLICT_VERSION' };
        return NextResponse.json(body, { status: 409 });
      }
      if (err.code === 'NOT_FOUND') {
        const body: TaxApiError = { error: 'Not found', code: 'NOT_FOUND' };
        return NextResponse.json(body, { status: 404 });
      }
    }
    console.error('[tax/companies PATCH]', err);
    const body: TaxApiError = { error: 'Internal server error', code: 'INTERNAL' };
    return NextResponse.json(body, { status: 500 });
  }
}
