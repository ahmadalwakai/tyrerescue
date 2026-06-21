import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import {
  buildCustomerSessionPayload,
  linkUnclaimedBookingsForEmail,
  type CustomerMobileUser,
} from '@/app/api/mobile/customer/_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 400 });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const [userRow] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    if (!userRow || userRow.role !== 'customer' || !userRow.passwordHash) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const validPassword = await bcrypt.compare(parsed.data.password, userRow.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const user: CustomerMobileUser = {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      phone: userRow.phone,
      role: userRow.role,
    };

    await linkUnclaimedBookingsForEmail(user.id, user.email);

    return NextResponse.json({
      success: true,
      ...(await buildCustomerSessionPayload(user)),
    });
  } catch (error) {
    console.error('[mobile-customer:login] error:', error);
    return NextResponse.json({ error: 'Failed to sign in' }, { status: 500 });
  }
}
