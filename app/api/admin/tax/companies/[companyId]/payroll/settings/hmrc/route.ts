import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { canWritePayrollSettings, canReadPayroll } from '@/lib/tax-payroll/permissions';
import { db } from '@/lib/db';
import { payrollSettings, payrollSettingsRevisions, taxAuditEvents } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { withTaxWriteTransaction } from '@/lib/tax-payroll/write-transaction';
import { payrollHmrcSettingsSchema, flattenZodErrors } from '@/lib/tax-payroll/validation';
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

  if (!(await canReadPayroll(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const [settings] = await db
    .select({
      id: payrollSettings.id,
      payeReference: payrollSettings.payeReference,
      accountsOfficeRef: payrollSettings.accountsOfficeRef,
      employerPensionSchemeRef: payrollSettings.employerPensionSchemeRef,
      pensionProviderName: payrollSettings.pensionProviderName,
      employeePensionRate: payrollSettings.employeePensionRate,
      employerPensionRate: payrollSettings.employerPensionRate,
      pensionContributionBasis: payrollSettings.pensionContributionBasis,
      version: payrollSettings.version,
    })
    .from(payrollSettings)
    .where(eq(payrollSettings.companyId, companyId))
    .limit(1);

  if (!settings) {
    return NextResponse.json<TaxApiError>({ error: 'Payroll not activated', code: 'NOT_FOUND' }, { status: 404 });
  }

  return NextResponse.json({ settings });
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

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const parsed = payrollHmrcSettingsSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json<TaxApiError>({ error: 'Validation failed', code: 'VALIDATION_ERROR',
    fieldErrors: flattenZodErrors(parsed.error) }, { status: 422 });
  const raw = parsed.data;

  try {
    return await withTaxWriteTransaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(payrollSettings)
        .where(eq(payrollSettings.companyId, companyId))
        .for('update');

      if (!current) {
        return NextResponse.json<TaxApiError>({ error: 'Payroll not activated', code: 'NOT_FOUND' }, { status: 404 });
      }

      if (current.version !== raw.expectedVersion) {
        return NextResponse.json<TaxApiError>({ error: `Version conflict`, code: 'CONFLICT_VERSION' }, { status: 409 });
      }

      const updates: Record<string, unknown> = { version: current.version + 1, updatedAt: new Date() };
      if (raw.payeReference !== undefined) updates.payeReference = raw.payeReference;
      if (raw.accountsOfficeRef !== undefined) updates.accountsOfficeRef = raw.accountsOfficeRef;
      if (raw.employerPensionSchemeRef !== undefined) updates.employerPensionSchemeRef = raw.employerPensionSchemeRef;
      if (raw.pensionProviderName !== undefined) updates.pensionProviderName = raw.pensionProviderName;
      if (raw.employeePensionRate !== undefined) updates.employeePensionRate = raw.employeePensionRate?.toString() ?? null;
      if (raw.employerPensionRate !== undefined) updates.employerPensionRate = raw.employerPensionRate?.toString() ?? null;
      if (raw.pensionContributionBasis !== undefined) updates.pensionContributionBasis = raw.pensionContributionBasis;

      const [updated] = await tx.update(payrollSettings).set(updates).where(and(
        eq(payrollSettings.companyId, companyId), eq(payrollSettings.version, raw.expectedVersion),
      )).returning();
      if (!updated) return NextResponse.json<TaxApiError>({ error: 'Version conflict', code: 'CONFLICT_VERSION' }, { status: 409 });
      const changedFields = Object.keys(raw).filter((key) => key !== 'expectedVersion');
      await tx.insert(payrollSettingsRevisions).values({ settingsId: updated.id, companyId, version: updated.version,
        snapshot: { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() },
        changedFields, changedByUserId: session.user.id });
      await tx.insert(taxAuditEvents).values({ companyId, actorUserId: session.user.id,
        eventType: 'payroll_settings_updated', payload: { changedFields, newVersion: updated.version } });
      return NextResponse.json({ updated: true, newVersion: updated.version });
    });
  } catch (err) {
    console.error('[payroll/settings/hmrc PATCH]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
