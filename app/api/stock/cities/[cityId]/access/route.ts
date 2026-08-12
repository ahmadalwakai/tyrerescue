import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, stockCities, stockUserCityAccess, users } from '@/lib/db';
import {
  forbiddenResponse,
  getStockApiUser,
  stockCorsPreflight,
  stockJsonResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from '../../../_lib';

const accessSchema = z.object({
  userId: z.string().uuid(),
  roleInCity: z.enum(['viewer', 'operator', 'manager']).default('operator'),
  isActive: z.boolean().default(true),
});

async function getCityOrNull(cityId: string) {
  const [city] = await db
    .select({ id: stockCities.id, slug: stockCities.slug, name: stockCities.name })
    .from(stockCities)
    .where(eq(stockCities.id, cityId))
    .limit(1);

  return city ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cityId: string }> },
) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);
  if (user.role !== 'admin') return forbiddenResponse('Admin access required', request);

  const { cityId } = await params;
  const city = await getCityOrNull(cityId);
  if (!city) return stockJsonResponse(request, { error: 'Stock city not found' }, { status: 404 });

  const rows = await db
    .select({
      id: stockUserCityAccess.id,
      userId: stockUserCityAccess.userId,
      userName: users.name,
      userEmail: users.email,
      userRole: users.role,
      roleInCity: stockUserCityAccess.roleInCity,
      isActive: stockUserCityAccess.isActive,
      createdAt: stockUserCityAccess.createdAt,
      updatedAt: stockUserCityAccess.updatedAt,
    })
    .from(stockUserCityAccess)
    .innerJoin(users, eq(stockUserCityAccess.userId, users.id))
    .where(eq(stockUserCityAccess.cityId, cityId))
    .orderBy(asc(users.name), asc(users.email));

  return stockJsonResponse(request, {
    city,
    items: rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: row.userName,
      userEmail: row.userEmail,
      userRole: row.userRole,
      roleInCity: row.roleInCity,
      isActive: row.isActive,
      createdAt: row.createdAt?.toISOString() ?? null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cityId: string }> },
) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);
  if (user.role !== 'admin') return forbiddenResponse('Admin access required', request);

  const { cityId } = await params;
  const city = await getCityOrNull(cityId);
  if (!city) return stockJsonResponse(request, { error: 'Stock city not found' }, { status: 404 });

  const body = await request.json();
  const parsed = accessSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.flatten(), request);

  const [targetUser] = await db
    .select({ id: users.id, role: users.role, name: users.name, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.id, parsed.data.userId),
        eq(users.emailVerified, true),
      ),
    )
    .limit(1);

  if (!targetUser || (targetUser.role !== 'driver' && targetUser.role !== 'admin')) {
    return stockJsonResponse(request, { error: 'Target user must be a verified driver or admin' }, { status: 400 });
  }

  const [access] = await db
    .insert(stockUserCityAccess)
    .values({
      userId: targetUser.id,
      cityId,
      roleInCity: parsed.data.roleInCity,
      isActive: parsed.data.isActive,
      createdByUserId: user.id,
    })
    .onConflictDoUpdate({
      target: [stockUserCityAccess.userId, stockUserCityAccess.cityId],
      set: {
        roleInCity: parsed.data.roleInCity,
        isActive: parsed.data.isActive,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: stockUserCityAccess.id,
      userId: stockUserCityAccess.userId,
      roleInCity: stockUserCityAccess.roleInCity,
      isActive: stockUserCityAccess.isActive,
      createdAt: stockUserCityAccess.createdAt,
      updatedAt: stockUserCityAccess.updatedAt,
    });

  return stockJsonResponse(request, {
    city,
    item: {
      id: access.id,
      userId: access.userId,
      userName: targetUser.name,
      userEmail: targetUser.email,
      userRole: targetUser.role,
      roleInCity: access.roleInCity,
      isActive: access.isActive,
      createdAt: access.createdAt?.toISOString() ?? null,
      updatedAt: access.updatedAt?.toISOString() ?? null,
    },
  });
}

export async function OPTIONS(request: Request) {
  return stockCorsPreflight(request);
}
