import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { canWriteEmployee, canReadPayroll } from '@/lib/tax-payroll/permissions';
import { assessPensionEnrolment } from '@/lib/tax-payroll/pension-service';
import { db } from '@/lib/db';
import { payrollEmployeeEnrolments, payrollEmployees } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { TaxApiError, UpdatePensionEnrolmentRequest } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string; employeeId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId, employeeId } = await context.params;

  if (!(await canReadPayroll(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const [enrolment] = await db
    .select()
    .from(payrollEmployeeEnrolments)
    .where(
      and(
        eq(payrollEmployeeEnrolments.companyId, companyId),
        eq(payrollEmployeeEnrolments.employeeId, employeeId),
      ),
    )
    .limit(1);

  return NextResponse.json({ enrolment: enrolment ?? null });
}

export async function PUT(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId, employeeId } = await context.params;

  if (!(await canWriteEmployee(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  let raw: UpdatePensionEnrolmentRequest;
  try {
    raw = await request.json() as UpdatePensionEnrolmentRequest;
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  // Load employee to get DOB for assessment
  const [emp] = await db
    .select({ dateOfBirth: payrollEmployees.dateOfBirth })
    .from(payrollEmployees)
    .where(and(eq(payrollEmployees.id, employeeId), eq(payrollEmployees.companyId, companyId)))
    .limit(1);

  if (!emp) {
    return NextResponse.json<TaxApiError>({ error: 'Employee not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    // Run assessment if assessment data provided
    if (raw.action === 'record_assessment' && raw.annualisedEarningsPence !== undefined) {
      const [existing] = await db
        .select()
        .from(payrollEmployeeEnrolments)
        .where(and(eq(payrollEmployeeEnrolments.companyId, companyId), eq(payrollEmployeeEnrolments.employeeId, employeeId)))
        .limit(1);

      const assessment = assessPensionEnrolment({
        employeeId,
        dateOfBirth: emp.dateOfBirth,
        assessmentDate: raw.assessmentDate ?? today,
        annualisedEarningsPence: raw.annualisedEarningsPence,
        currentEnrolmentStatus: (existing?.enrolmentStatus ?? 'not_assessed') as 'not_assessed' | 'enrolled' | 'opted_out' | 'postponed' | 'ceased',
        enrolmentDate: existing?.enrolmentDate ?? null,
        optOutWindowEnds: existing?.optOutWindowEnds ?? null,
        schemeContributionBasis: 'qualifying_earnings',
        employeeContributionRate: 0.05,
        employerContributionRate: 0.03,
      });

      await db
        .insert(payrollEmployeeEnrolments)
        .values({
          companyId,
          employeeId,
          enrolmentStatus: assessment.enrolmentStatus,
          workerCategory: assessment.workerCategory,
          lastAssessmentDate: raw.assessmentDate ?? today,
          lastAssessmentAnnualisedEarningsPence: raw.annualisedEarningsPence,
          thresholdsVersion: assessment.thresholdsVersion,
          recordedByUserId: session.user.id,
          version: 1,
        })
        .onConflictDoUpdate({
          target: [payrollEmployeeEnrolments.companyId, payrollEmployeeEnrolments.employeeId],
          set: {
            enrolmentStatus: assessment.enrolmentStatus,
            workerCategory: assessment.workerCategory,
            lastAssessmentDate: raw.assessmentDate ?? today,
            lastAssessmentAnnualisedEarningsPence: raw.annualisedEarningsPence,
            thresholdsVersion: assessment.thresholdsVersion,
            updatedAt: new Date(),
          },
        });

      return NextResponse.json({ assessment });
    }

    // Handle other actions (enrol, opt_out, cease)
    const statusMap: Record<string, string> = {
      enrol: 'enrolled',
      opt_out: 'opted_out',
      cease: 'ceased',
    };
    const newStatus = statusMap[raw.action];
    if (!newStatus) {
      return NextResponse.json<TaxApiError>({ error: `Unknown action: ${raw.action}`, code: 'VALIDATION_ERROR' }, { status: 422 });
    }

    await db
      .insert(payrollEmployeeEnrolments)
      .values({
        companyId,
        employeeId,
        enrolmentStatus: newStatus,
        enrolmentDate: raw.action === 'enrol' ? (raw.enrolmentDate ?? today) : undefined,
        optOutDate: raw.action === 'opt_out' ? (raw.optOutDate ?? today) : undefined,
        cessationDate: raw.action === 'cease' ? (raw.cessationDate ?? today) : undefined,
        recordedByUserId: session.user.id,
        version: 1,
      })
      .onConflictDoUpdate({
        target: [payrollEmployeeEnrolments.companyId, payrollEmployeeEnrolments.employeeId],
        set: {
          enrolmentStatus: newStatus,
          enrolmentDate: raw.action === 'enrol' ? (raw.enrolmentDate ?? today) : undefined,
          optOutDate: raw.action === 'opt_out' ? (raw.optOutDate ?? today) : undefined,
          cessationDate: raw.action === 'cease' ? (raw.cessationDate ?? today) : undefined,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ updated: true, newStatus });
  } catch (err) {
    console.error('[payroll/employees/:id/enrolment PUT]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
