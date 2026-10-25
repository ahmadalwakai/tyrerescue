import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { canReadSensitive, canReadPayroll } from '@/lib/tax-payroll/permissions';
import { getDocumentBytes, DocumentError } from '@/lib/tax-payroll/document-service';
import type { TaxApiError } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string; docId: string }>;
}

// GET: download a document binary
export async function GET(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId, docId } = await context.params;

  if (!(await canReadPayroll(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  // Document download requires sensitive read (contains financial data)
  if (!(await canReadSensitive(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Insufficient permissions', code: 'UNAUTHENTICATED' }, { status: 403 });
  }

  try {
    const { metadata, bytes } = await getDocumentBytes(companyId, docId);

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': metadata.mimeType,
        'Content-Disposition': `attachment; filename="${metadata.filename}"`,
        'Content-Length': String(metadata.sizeBytes),
        'X-Content-Hash': metadata.contentHash,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    if (err instanceof DocumentError) {
      if (err.code === 'NOT_FOUND') return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    console.error('[documents/:id GET]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
