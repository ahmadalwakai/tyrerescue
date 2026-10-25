import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { canReadPayroll, canReadSensitive } from '@/lib/tax-payroll/permissions';
import { listDocumentsForEntity, getDocumentBytes } from '@/lib/tax-payroll/document-service';
import type { TaxApiError } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string; runId: string }>;
}

// GET: list payslip documents for this run
export async function GET(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId, runId } = await context.params;

  if (!(await canReadPayroll(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  // Payslip download requires sensitive.read (contains employee financial data)
  const hasSensitive = await canReadSensitive(session.user.id, companyId);

  try {
    const docs = await listDocumentsForEntity(companyId, runId);
    const payslips = docs.filter((d) => d.kind === 'payslip');

    if (!hasSensitive) {
      // Return metadata only — no download URLs
      return NextResponse.json({
        payslips: payslips.map((d) => ({
          id: d.id,
          kind: d.kind,
          filename: d.filename,
          sizeBytes: d.sizeBytes,
          generatedAt: d.generatedAt,
        })),
        downloadAvailable: false,
      });
    }

    return NextResponse.json({
      payslips: payslips.map((d) => ({
        id: d.id,
        kind: d.kind,
        filename: d.filename,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        contentHash: d.contentHash,
        generatedAt: d.generatedAt,
        downloadUrl: `/api/admin/tax/companies/${companyId}/documents/${d.id}`,
      })),
      downloadAvailable: true,
    });
  } catch (err) {
    console.error('[payroll/runs/:id/payslips GET]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
