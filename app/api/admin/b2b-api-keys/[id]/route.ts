import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { b2bApiClients, b2bApiKeys, b2bApiKeyAuditLogs } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { writeAdminAuditLog } from '@/lib/b2b/auth';
import { B2B_SCOPES, B2B_PLATFORMS } from '@/lib/b2b/types';
import type { B2BScope, B2BPlatform } from '@/lib/b2b/types';

// ── Zod schema ─────────────────────────────────────────

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  companyName: z.string().max(255).optional().nullable(),
  contactName: z.string().max(255).optional().nullable(),
  contactEmail: z.string().email().max(255).optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  keyLabel: z.string().min(1).max(255).optional(),
  allowedScopes: z.array(z.enum(B2B_SCOPES)).min(1).optional(),
  allowedPlatforms: z.array(z.enum(B2B_PLATFORMS)).min(1).optional(),
  allowedStockFilters: z.record(z.string(), z.unknown()).optional().nullable(),
  rateLimitPerMinute: z.number().int().min(1).max(10000).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
}).strict();

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/admin/b2b-api-keys/[id] ──────────────────

export async function GET(_request: Request, { params }: RouteContext) {
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

    // Keys — never return key_hash
    const keys = await db
      .select({
        id: b2bApiKeys.id,
        keyPrefix: b2bApiKeys.keyPrefix,
        label: b2bApiKeys.label,
        status: b2bApiKeys.status,
        allowedScopes: b2bApiKeys.allowedScopes,
        allowedPlatforms: b2bApiKeys.allowedPlatforms,
        allowedStockFilters: b2bApiKeys.allowedStockFilters,
        rateLimitPerMinute: b2bApiKeys.rateLimitPerMinute,
        expiresAt: b2bApiKeys.expiresAt,
        lastUsedAt: b2bApiKeys.lastUsedAt,
        createdAt: b2bApiKeys.createdAt,
        updatedAt: b2bApiKeys.updatedAt,
        revokedAt: b2bApiKeys.revokedAt,
      })
      .from(b2bApiKeys)
      .where(eq(b2bApiKeys.clientId, id))
      .orderBy(desc(b2bApiKeys.createdAt));

    // Audit logs (most recent 50)
    const auditLogs = await db
      .select({
        id: b2bApiKeyAuditLogs.id,
        apiKeyId: b2bApiKeyAuditLogs.apiKeyId,
        action: b2bApiKeyAuditLogs.action,
        route: b2bApiKeyAuditLogs.route,
        statusCode: b2bApiKeyAuditLogs.statusCode,
        metadata: b2bApiKeyAuditLogs.metadata,
        createdAt: b2bApiKeyAuditLogs.createdAt,
        // Omit ip_address and user_agent from detail view for brevity;
        // they remain in DB for forensics queries
      })
      .from(b2bApiKeyAuditLogs)
      .where(eq(b2bApiKeyAuditLogs.clientId, id))
      .orderBy(desc(b2bApiKeyAuditLogs.createdAt))
      .limit(50);

    return NextResponse.json({
      client: {
        id: client.id,
        name: client.name,
        companyName: client.companyName,
        contactName: client.contactName,
        contactEmail: client.contactEmail,
        contactPhone: client.contactPhone,
        status: client.status,
        notes: client.notes,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
        revokedAt: client.revokedAt,
        lastUsedAt: client.lastUsedAt,
      },
      keys,
      auditLogs,
    });
  } catch (err) {
    console.error('[GET /api/admin/b2b-api-keys/[id]]', err);
    return NextResponse.json({ error: 'Failed to load client details' }, { status: 500 });
  }
}

// ── PATCH /api/admin/b2b-api-keys/[id] ────────────────

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const [client] = await db
      .select()
      .from(b2bApiClients)
      .where(eq(b2bApiClients.id, id))
      .limit(1);

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Build client updates
    const clientUpdates: Partial<typeof b2bApiClients.$inferInsert> = { updatedAt: new Date() };
    if (data.name !== undefined) clientUpdates.name = data.name;
    if ('companyName' in data) clientUpdates.companyName = data.companyName ?? null;
    if ('contactName' in data) clientUpdates.contactName = data.contactName ?? null;
    if ('contactEmail' in data) clientUpdates.contactEmail = data.contactEmail ?? null;
    if ('contactPhone' in data) clientUpdates.contactPhone = data.contactPhone ?? null;
    if ('notes' in data) clientUpdates.notes = data.notes ?? null;

    if (Object.keys(clientUpdates).length > 1) {
      await db.update(b2bApiClients).set(clientUpdates).where(eq(b2bApiClients.id, id));
    }

    // Build key updates (apply to the active key for this client)
    const keyUpdates: Partial<typeof b2bApiKeys.$inferInsert> = { updatedAt: new Date() };
    if (data.keyLabel !== undefined) keyUpdates.label = data.keyLabel;
    if (data.allowedScopes !== undefined) keyUpdates.allowedScopes = data.allowedScopes as B2BScope[];
    if (data.allowedPlatforms !== undefined) keyUpdates.allowedPlatforms = data.allowedPlatforms as B2BPlatform[];
    if ('allowedStockFilters' in data) keyUpdates.allowedStockFilters = data.allowedStockFilters ?? null;
    if (data.rateLimitPerMinute !== undefined) keyUpdates.rateLimitPerMinute = data.rateLimitPerMinute;
    if ('expiresAt' in data) {
      keyUpdates.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    }

    if (Object.keys(keyUpdates).length > 1) {
      // Only update keys that are not revoked (revoked keys are immutable)
      await db
        .update(b2bApiKeys)
        .set(keyUpdates)
        .where(and(eq(b2bApiKeys.clientId, id), eq(b2bApiKeys.status, 'active')));
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    await writeAdminAuditLog({
      adminUserId: session.user.id,
      action: 'admin_client_updated',
      clientId: id,
      route: `/api/admin/b2b-api-keys/${id}`,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent'),
      metadata: { updatedFields: Object.keys(data) },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/admin/b2b-api-keys/[id]]', err);
    return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
  }
}
