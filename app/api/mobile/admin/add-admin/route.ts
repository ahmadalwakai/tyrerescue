import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import {
  ADD_ADMIN_ALLOWED_ROLES,
  AdminManagementError,
  createAdminAccount,
  createAdminUserSchema,
  getAddAdminPinHash,
  isOwnerLevelAdmin,
  recordAdminManagementAudit,
  verifyAddAdminUnlock,
} from '@/lib/admin-management';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function forbiddenResponse() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}

function validationResponse(error: ZodError) {
  return NextResponse.json(
    {
      error: 'Please check the form and try again.',
      code: 'VALIDATION_ERROR',
      fieldErrors: error.flatten().fieldErrors,
    },
    { status: 400, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request: Request) {
  const admin = await getMobileAdminUser(request);
  if (!admin) return unauthorizedResponse();

  const ownerAllowed = await isOwnerLevelAdmin(admin.id);
  if (!ownerAllowed) {
    await recordAdminManagementAudit({
      request,
      actorUserId: admin.id,
      action: 'add_admin_forbidden',
      afterJson: { reason: 'not_owner_level' },
    });
    return forbiddenResponse();
  }

  return NextResponse.json(
    {
      canAccess: true,
      roles: ADD_ADMIN_ALLOWED_ROLES,
      pinConfigured: Boolean(await getAddAdminPinHash()),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const admin = await getMobileAdminUser(request);
  if (!admin) return unauthorizedResponse();

  const ownerAllowed = await isOwnerLevelAdmin(admin.id);
  if (!ownerAllowed) {
    await recordAdminManagementAudit({
      request,
      actorUserId: admin.id,
      action: 'add_admin_forbidden',
      afterJson: { reason: 'not_owner_level' },
    });
    return forbiddenResponse();
  }

  const body = await request.json().catch(() => null);
  const parsed = createAdminUserSchema.safeParse(body);
  if (!parsed.success) return validationResponse(parsed.error);

  if (!verifyAddAdminUnlock(admin.id, parsed.data.unlockToken)) {
    await recordAdminManagementAudit({
      request,
      actorUserId: admin.id,
      action: 'add_admin_unlock_rejected',
      afterJson: { reason: 'missing_or_expired_unlock' },
    });
    return NextResponse.json(
      { error: 'Security unlock expired. Enter the PIN again.', code: 'UNLOCK_EXPIRED' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const created = await createAdminAccount({
      input: parsed.data,
      creator: { id: admin.id, role: admin.role },
      request,
    });
    return NextResponse.json({ success: true, admin: created }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AdminManagementError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          fieldErrors: error.fieldErrors,
        },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      { error: 'Failed to create admin account.', code: 'CREATE_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
