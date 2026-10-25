import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { activatePayrollSchema, updatePayrollSettingsSchema, flattenZodErrors } from '@/lib/tax-payroll/validation';
import {
  activatePayroll,
  getPayrollSettings,
  updatePayrollSettings,
  PayrollSettingsError,
} from '@/lib/tax-payroll/payroll-settings-service';
import { canWritePayrollSettings, canWriteCompany } from '@/lib/tax-payroll/permissions';
import { getCompanyPayrollSetup } from '@/lib/tax-payroll/payroll-setup-service';
import type { TaxApiError } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId } = await context.params;

  try {
    const payrollSetup = await getCompanyPayrollSetup(session.user.id, companyId);
    const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization' };
    if (!payrollSetup) {
      return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404, headers });
    }
    if (payrollSetup.state === 'not_activated') {
      // Installed build 46 recognises this exact error/code combination.
      return NextResponse.json({ error: 'Payroll not activated', code: 'NOT_FOUND',
        reason: 'PAYROLL_NOT_ACTIVATED', payrollSetup }, { status: 404, headers });
    }
    if (!payrollSetup.canRead) {
      return NextResponse.json({ error: 'Payroll access is required. Ask the company founder to grant payroll read access.',
        code: 'PAYROLL_ACCESS_REQUIRED' }, { status: 403, headers });
    }
    const settings = await getPayrollSettings(companyId);
    if (!settings) {
      // The readiness read found active payroll; a concurrent inconsistency is
      // unavailable, not evidence that it is safe to activate again.
      return NextResponse.json<TaxApiError>({ error: 'Unable to load payroll settings. Please retry.', code: 'INTERNAL' }, { status: 503, headers });
    }
    return NextResponse.json({ ...settings, payrollSetup }, { headers });
  } catch (err) {
    console.error('[payroll/settings GET]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}

// POST activates payroll. Only the company founder may call this.
export async function POST(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId } = await context.params;

  if (!(await canWriteCompany(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const parsed = activatePayrollSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json<TaxApiError>(
      { error: 'Validation failed', code: 'VALIDATION_ERROR', fieldErrors: flattenZodErrors(parsed.error) },
      { status: 422 },
    );
  }

  try {
    const settings = await activatePayroll(session.user.id, companyId, parsed.data);
    return NextResponse.json(settings, { status: 201 });
  } catch (err) {
    if (err instanceof PayrollSettingsError) {
      if (err.code === 'VALIDATION_ERROR') {
        return NextResponse.json<TaxApiError>({ error: err.message, code: 'VALIDATION_ERROR' }, { status: 422 });
      }
      if (err.code === 'ALREADY_ACTIVATED') {
        return NextResponse.json<TaxApiError>({ error: err.message, code: 'CONFLICT_DUPLICATE' }, { status: 409 });
      }
      if (err.code === 'FORBIDDEN') {
        return NextResponse.json<TaxApiError>({ error: 'Only the company founder may activate payroll.', code: 'FORBIDDEN' }, { status: 403 });
      }
      if (err.code === 'NOT_FOUND') {
        return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
      }
    }
    console.error('[payroll/settings POST]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId } = await context.params;

  if (!(await canWritePayrollSettings(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const parsed = updatePayrollSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json<TaxApiError>(
      { error: 'Validation failed', code: 'VALIDATION_ERROR', fieldErrors: flattenZodErrors(parsed.error) },
      { status: 422 },
    );
  }

  try {
    const updated = await updatePayrollSettings(session.user.id, companyId, parsed.data);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof PayrollSettingsError) {
      if (err.code === 'VALIDATION_ERROR') {
        return NextResponse.json<TaxApiError>({ error: err.message, code: 'VALIDATION_ERROR' }, { status: 422 });
      }
      if (err.code === 'CONFLICT_VERSION') {
        return NextResponse.json<TaxApiError>({ error: err.message, code: 'CONFLICT_VERSION' }, { status: 409 });
      }
      if (err.code === 'NOT_ACTIVATED') {
        return NextResponse.json<TaxApiError>({ error: 'Payroll not activated', code: 'NOT_FOUND' }, { status: 404 });
      }
    }
    console.error('[payroll/settings PATCH]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
