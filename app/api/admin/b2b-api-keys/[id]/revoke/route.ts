import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { b2bApiClients, b2bApiKeys } from '@/lib/db/schema';
import { eq, and, ne } from 'drizzle-orm';
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
      return NextResponse.json({ error: 'Client is already revoked' }, { status: 409 });
    }

    const now = new Date();

    // Revoke client
    await db
      .update(b2bApiClients)
      .set({ status: 'revoked', revokedAt: now, updatedAt: now })
      .where(eq(b2bApiClients.id, id));

    // Revoke all non-revoked keys
    await db
      .update(b2bApiKeys)
      .set({ status: 'revoked', revokedAt: now, updatedAt: now })
      .where(and(eq(b2bApiKeys.clientId, id), ne(b2bApiKeys.status, 'revoked')));

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    await writeAdminAuditLog({
      adminUserId: session.user.id,
      action: 'admin_client_revoked',
      clientId: id,
      route: `/api/admin/b2b-api-keys/${id}/revoke`,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/admin/b2b-api-keys/[id]/revoke]', err);
    return NextResponse.json({ error: 'Failed to revoke client' }, { status: 500 });
  }
}
