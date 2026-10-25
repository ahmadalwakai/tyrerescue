import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { canReadCompany } from '@/lib/tax-payroll/permissions';
import {
  listNotificationsForUser,
  markNotificationRead,
} from '@/lib/tax-payroll/notification-service';
import type { TaxApiError, MarkNotificationReadRequest } from '@/lib/tax-payroll/contracts';

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

  if (!(await canReadCompany(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true';

  try {
    const notifications = await listNotificationsForUser(companyId, session.user.id, unreadOnly);
    return NextResponse.json({ notifications });
  } catch (err) {
    console.error('[notifications GET]', err);
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

  if (!(await canReadCompany(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  let raw: MarkNotificationReadRequest;
  try {
    raw = await request.json() as MarkNotificationReadRequest;
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  if (!raw.notificationId) {
    return NextResponse.json<TaxApiError>({ error: 'notificationId is required', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  try {
    await markNotificationRead(companyId, session.user.id, raw.notificationId);
    return NextResponse.json({ marked: true });
  } catch (err) {
    console.error('[notifications PATCH]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
