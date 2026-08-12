import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, stockCities, stockUserCityAccess } from '@/lib/db';
import {
  forbiddenResponse,
  getStockApiUser,
  stockCorsPreflight,
  stockJsonResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from '../_lib';

const createCitySchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'Use a lowercase URL-safe slug')
    .min(3)
    .max(100),
  name: z.string().trim().min(2).max(120),
  grantCurrentUserAccess: z.boolean().default(true),
});

export async function GET(request: Request) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);

  const rows = await db
    .select({
      id: stockCities.id,
      slug: stockCities.slug,
      name: stockCities.name,
      isActive: stockCities.isActive,
      roleInCity: stockUserCityAccess.roleInCity,
      createdAt: stockCities.createdAt,
      updatedAt: stockCities.updatedAt,
    })
    .from(stockUserCityAccess)
    .innerJoin(stockCities, eq(stockUserCityAccess.cityId, stockCities.id))
    .where(
      and(
        eq(stockUserCityAccess.userId, user.id),
        eq(stockUserCityAccess.isActive, true),
        eq(stockCities.isActive, true),
      ),
    )
    .orderBy(asc(stockCities.name));

  return stockJsonResponse(request, {
    items: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      isActive: row.isActive,
      roleInCity: row.roleInCity,
      createdAt: row.createdAt?.toISOString() ?? null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);
  if (user.role !== 'admin') return forbiddenResponse('Admin access required', request);

  const body = await request.json();
  const parsed = createCitySchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.flatten(), request);

  const { slug, name, grantCurrentUserAccess } = parsed.data;
  const [created] = await db
    .insert(stockCities)
    .values({
      slug,
      name,
      createdByUserId: user.id,
    })
    .onConflictDoNothing()
    .returning({
      id: stockCities.id,
      slug: stockCities.slug,
      name: stockCities.name,
      isActive: stockCities.isActive,
      createdAt: stockCities.createdAt,
      updatedAt: stockCities.updatedAt,
    });

  if (!created) {
    return stockJsonResponse(request, { error: 'Stock city already exists' }, { status: 409 });
  }

  if (grantCurrentUserAccess) {
    await db
      .insert(stockUserCityAccess)
      .values({
        userId: user.id,
        cityId: created.id,
        roleInCity: 'manager',
        createdByUserId: user.id,
      })
      .onConflictDoUpdate({
        target: [stockUserCityAccess.userId, stockUserCityAccess.cityId],
        set: {
          roleInCity: 'manager',
          isActive: true,
          updatedAt: new Date(),
        },
      });
  }

  return stockJsonResponse(request, {
    item: {
      id: created.id,
      slug: created.slug,
      name: created.name,
      isActive: created.isActive,
      roleInCity: grantCurrentUserAccess ? 'manager' : null,
      createdAt: created.createdAt?.toISOString() ?? null,
      updatedAt: created.updatedAt?.toISOString() ?? null,
    },
  }, { status: 201 });
}

export async function OPTIONS(request: Request) {
  return stockCorsPreflight(request);
}
