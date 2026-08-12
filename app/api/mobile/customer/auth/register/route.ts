import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  buildCustomerSessionPayload,
  linkUnclaimedBookingsForEmail,
  sendCustomerVerification,
  type CustomerMobileUser,
} from '@/app/api/mobile/customer/_lib';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(255),
  email: z.string().email('Invalid email address').max(255),
  phone: z.string().min(5, 'Phone must be at least 5 characters').max(20).nullish(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request' },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const email = data.email.trim().toLowerCase();
    const [existingUser] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    if (existingUser) {
      if (existingUser.role !== 'customer') {
        return NextResponse.json(
          { error: 'This email is already used for a staff account.' },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: 'Account already exists. Sign in instead.' },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const [newUser] = await db
      .insert(users)
      .values({
        name: data.name.trim(),
        email,
        passwordHash,
        phone: data.phone?.trim() || null,
        role: 'customer',
        emailVerified: false,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
        role: users.role,
      });

    const user: CustomerMobileUser = newUser;
    await sendCustomerVerification(user);
    await linkUnclaimedBookingsForEmail(user.id, user.email);

    return NextResponse.json({
      success: true,
      created: true,
      message: 'Account created. Check your email to verify it.',
      ...(await buildCustomerSessionPayload(user)),
    });
  } catch (error) {
    console.error('[mobile-customer:register] error:', error);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
