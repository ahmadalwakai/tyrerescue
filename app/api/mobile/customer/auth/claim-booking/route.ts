import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { bookings, users } from '@/lib/db/schema';
import {
  buildCustomerSessionPayload,
  isCustomerVisibleBookingStatus,
  linkUnclaimedBookingsForEmail,
  sendCustomerVerification,
  type CustomerMobileUser,
} from '@/app/api/mobile/customer/_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const claimBookingSchema = z.object({
  refNumber: z.string().min(3).max(30),
  name: z.string().min(2).max(255).optional(),
  email: z.string().email().max(255),
  phone: z.string().min(5).max(20).optional(),
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
    const parsed = claimBookingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request' },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const email = data.email.trim().toLowerCase();
    const refNumber = data.refNumber.trim().toUpperCase();

    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.refNumber, refNumber))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.customerEmail.toLowerCase() !== email) {
      return NextResponse.json(
        { error: 'Use the same email address used for this booking.' },
        { status: 403 },
      );
    }

    if (!isCustomerVisibleBookingStatus(booking.status) || booking.status === 'awaiting_payment') {
      return NextResponse.json(
        { error: 'Create an account after payment is completed.' },
        { status: 409 },
      );
    }

    const [existingUser] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    let user: CustomerMobileUser;
    let created = false;

    if (existingUser) {
      if (existingUser.role !== 'customer') {
        return NextResponse.json(
          { error: 'This email is already used for a staff account.' },
          { status: 409 },
        );
      }

      if (!existingUser.passwordHash) {
        return NextResponse.json(
          { error: 'This account uses Google sign-in. Please sign in on the website first.' },
          { status: 409 },
        );
      }

      const validPassword = await bcrypt.compare(data.password, existingUser.passwordHash);
      if (!validPassword) {
        return NextResponse.json(
          { error: 'Account already exists. Enter the existing password to link this booking.' },
          { status: 401 },
        );
      }

      user = {
        id: existingUser.id,
        email: existingUser.email,
        name: existingUser.name,
        phone: existingUser.phone,
        role: existingUser.role,
      };
    } else {
      const passwordHash = await bcrypt.hash(data.password, 12);
      const [newUser] = await db
        .insert(users)
        .values({
          name: data.name?.trim() || booking.customerName,
          email,
          passwordHash,
          phone: data.phone?.trim() || booking.customerPhone,
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

      user = newUser;
      created = true;
      await sendCustomerVerification(newUser);
    }

    if (booking.userId && booking.userId !== user.id) {
      return NextResponse.json(
        { error: 'This booking is already linked to another account.' },
        { status: 409 },
      );
    }

    await linkUnclaimedBookingsForEmail(user.id, email);
    const payload = await buildCustomerSessionPayload(user);

    return NextResponse.json({
      success: true,
      created,
      message: created
        ? 'Account created. Check your email to verify it.'
        : 'Signed in and linked your booking.',
      ...payload,
    });
  } catch (error) {
    console.error('[mobile-customer:claim-booking] error:', error);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
