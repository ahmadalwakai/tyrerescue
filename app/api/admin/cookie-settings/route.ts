import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cookieSettings, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select({
      id: cookieSettings.id,
      key: cookieSettings.key,
      value: cookieSettings.value,
      label: cookieSettings.label,
      description: cookieSettings.description,
      updatedAt: cookieSettings.updatedAt,
      updatedByName: users.name,
    })
    .from(cookieSettings)
    .leftJoin(users, eq(cookieSettings.updatedBy, users.id));

  return NextResponse.json(rows);
}
