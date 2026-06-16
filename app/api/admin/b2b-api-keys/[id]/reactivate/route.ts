import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { b2bApiClients, b2bApiKeys } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { writeAdminAuditLog } from '@/lib/b2b/auth';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [client] = await db
      .select()
      .from(b2bApiClients)
      .where(eq(b2bApiClients.id, id))
      .limit(1);

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    if (client.status === 'revoked') {
      return NextResponse.json({ error: 'Revoked clients cannot be reactivated' }, { status: 409 });
    }

    if (client.status === 'active') {
      return NextResponse.json({ error: 'Client is already active' }, { status: 409 });
    }

    // Check that no keys are expired (reactivating a client with only expired keys is pointless)
    const keys = await db
      .select()
      .from(b2bApiKeys)
      .where(and(eq(b2bApiKeys.clientId, id), eq(b2bApiKeys.status, 'suspended')));

    const now = new Date();
    const validKeys = keys.filter(
      (k) => !k.expiresAt || k.expiresAt > now,
    );

    if (validKeys.length === 0 && keys.length > 0) {
      return NextResponse.json(
        { error: 'All suspended keys are expired. Generate a new key instead.' },
        { status: 409 },
      );
    }

    await db
      .update(b2bApiClients)
      .set({ status: 'active', updatedAt: now })
      .where(eq(b2bApiClients.id, id));

    // Reactivate non-expired suspended keys
    for (const k of validKeys) {
      await db
        .update(b2bApiKeys)
        .set({ status: 'active', updatedAt: now })
        .where(eq(b2bApiKeys.id, k.id));
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    await writeAdminAuditLog({
      adminUserId: session.user.id,
      action: 'admin_client_reactivated',
      clientId: id,
      route: `/api/admin/b2b-api-keys/${id}/reactivate`,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent'),
      metadata: { reactivatedKeyCount: validKeys.length },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/admin/b2b-api-keys/[id]/reactivate]', err);
    return NextResponse.json({ error: 'Failed to reactivate client' }, { status: 500 });
  }
}
