import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { b2bApiClients, b2bApiKeys } from '@/lib/db/schema';
import { eq, desc, count } from 'drizzle-orm';
import { z } from 'zod';
import { generateB2BApiKey } from '@/lib/b2b/crypto';
import { writeAdminAuditLog } from '@/lib/b2b/auth';
import { B2B_SCOPES, B2B_PLATFORMS } from '@/lib/b2b/types';
import type { B2BScope, B2BPlatform } from '@/lib/b2b/types';

// ── Zod schemas ────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(255),
  companyName: z.string().max(255).optional().nullable(),
  contactName: z.string().max(255).optional().nullable(),
  contactEmail: z.string().email().max(255).optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  keyLabel: z.string().min(1).max(255),
  allowedScopes: z.array(z.enum(B2B_SCOPES)).min(1),
  allowedPlatforms: z.array(z.enum(B2B_PLATFORMS)).min(1),
  allowedStockFilters: z.record(z.string(), z.unknown()).optional().nullable(),
  rateLimitPerMinute: z.number().int().min(1).max(10000).default(60),
  expiresAt: z.string().datetime().optional().nullable(),
});

// ── GET /api/admin/b2b-api-keys ────────────────────────

export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const clients = await db
      .select()
      .from(b2bApiClients)
      .orderBy(desc(b2bApiClients.createdAt));

    // Fetch key summaries per client (no raw key or key_hash ever returned)
    const clientsWithKeys = await Promise.all(
      clients.map(async (client) => {
        const keys = await db
          .select({
            id: b2bApiKeys.id,
            keyPrefix: b2bApiKeys.keyPrefix,
            label: b2bApiKeys.label,
            status: b2bApiKeys.status,
            allowedScopes: b2bApiKeys.allowedScopes,
            allowedPlatforms: b2bApiKeys.allowedPlatforms,
            rateLimitPerMinute: b2bApiKeys.rateLimitPerMinute,
            expiresAt: b2bApiKeys.expiresAt,
            lastUsedAt: b2bApiKeys.lastUsedAt,
            createdAt: b2bApiKeys.createdAt,
          })
          .from(b2bApiKeys)
          .where(eq(b2bApiKeys.clientId, client.id))
          .orderBy(desc(b2bApiKeys.createdAt));

        return {
          id: client.id,
          name: client.name,
          companyName: client.companyName,
          contactName: client.contactName,
          contactEmail: client.contactEmail,
          contactPhone: client.contactPhone,
          status: client.status,
          notes: client.notes,
          lastUsedAt: client.lastUsedAt,
          createdAt: client.createdAt,
          updatedAt: client.updatedAt,
          revokedAt: client.revokedAt,
          keyCount: keys.length,
          keys,
        };
      }),
    );

    return NextResponse.json({ clients: clientsWithKeys });
  } catch (err) {
    console.error('[GET /api/admin/b2b-api-keys]', err);
    return NextResponse.json({ error: 'Failed to load B2B API keys' }, { status: 500 });
  }
}

// ── POST /api/admin/b2b-api-keys ───────────────────────

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    // Create the client record
    const [newClient] = await db
      .insert(b2bApiClients)
      .values({
        name: data.name,
        companyName: data.companyName ?? null,
        contactName: data.contactName ?? null,
        contactEmail: data.contactEmail ?? null,
        contactPhone: data.contactPhone ?? null,
        notes: data.notes ?? null,
        status: 'active',
        createdByAdminId: session.user.id,
      })
      .returning();

    // Generate the raw key — this is the ONLY time the full key is available
    const { rawKey, keyPrefix, keyHash } = generateB2BApiKey();

    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

    // Insert the key record — store hash and prefix only, never the raw key
    const [newKey] = await db
      .insert(b2bApiKeys)
      .values({
        clientId: newClient.id,
        keyPrefix,
        keyHash,
        label: data.keyLabel,
        status: 'active',
        allowedScopes: data.allowedScopes as B2BScope[],
        allowedPlatforms: data.allowedPlatforms as B2BPlatform[],
        allowedStockFilters: data.allowedStockFilters ?? null,
        rateLimitPerMinute: data.rateLimitPerMinute,
        expiresAt,
      })
      .returning({
        id: b2bApiKeys.id,
        keyPrefix: b2bApiKeys.keyPrefix,
        label: b2bApiKeys.label,
        status: b2bApiKeys.status,
        allowedScopes: b2bApiKeys.allowedScopes,
        allowedPlatforms: b2bApiKeys.allowedPlatforms,
        allowedStockFilters: b2bApiKeys.allowedStockFilters,
        rateLimitPerMinute: b2bApiKeys.rateLimitPerMinute,
        expiresAt: b2bApiKeys.expiresAt,
        createdAt: b2bApiKeys.createdAt,
      });

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    await writeAdminAuditLog({
      adminUserId: session.user.id,
      action: 'admin_key_created',
      clientId: newClient.id,
      keyId: newKey.id,
      route: '/api/admin/b2b-api-keys',
      ipAddress: ip,
      userAgent: request.headers.get('user-agent'),
      metadata: { keyPrefix, scopes: data.allowedScopes, platforms: data.allowedPlatforms },
    });

    // Access preview: what the key can and cannot access
    const accessPreview = buildAccessPreview(
      data.allowedScopes as B2BScope[],
      data.allowedPlatforms as B2BPlatform[],
    );

    return NextResponse.json(
      {
        client: {
          id: newClient.id,
          name: newClient.name,
          companyName: newClient.companyName,
          status: newClient.status,
          createdAt: newClient.createdAt,
        },
        key: newKey,
        // Raw key is returned ONCE here and never stored or returned again
        rawApiKey: rawKey,
        accessPreview,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[POST /api/admin/b2b-api-keys]', err);
    return NextResponse.json({ error: 'Failed to create B2B API key' }, { status: 500 });
  }
}

// ── Access preview builder ─────────────────────────────

function buildAccessPreview(scopes: B2BScope[], platforms: B2BPlatform[]) {
  const allowed: string[] = [];
  const denied: string[] = [
    'Customer details',
    'Bookings',
    'Payments & Stripe',
    'SMS messages',
    'Driver private data',
    'Admin settings & users',
    'Internal costs',
    'Any write/delete stock action',
  ];

  if (scopes.includes('stock:read')) allowed.push('Tyre stock listing (brand, size, season, quantity)');
  if (scopes.includes('stock:availability:read')) allowed.push('Stock availability checks by tyre size');
  if (scopes.includes('stock:prices:read')) allowed.push('Tyre selling prices');
  else denied.push('Tyre prices (requires stock:prices:read)');
  if (scopes.includes('stock:reserve')) allowed.push('Atomic stock reservation');
  if (scopes.includes('stock:movement:read')) allowed.push('Stock movement / audit trail (read-only)');
  if (scopes.includes('stock:sync:read')) allowed.push('Stock sync read for app integrations');

  if (platforms.includes('admin_web')) allowed.push('Admin web access');
  if (platforms.includes('android_admin_app')) allowed.push('Android admin app access');
  if (platforms.includes('android_mobile_app')) allowed.push('Android mobile app access');
  if (platforms.includes('android_driver_app')) allowed.push('Android driver app access');
  if (platforms.includes('external_b2b_api')) allowed.push('External B2B API access');

  return { allowed, denied };
}
