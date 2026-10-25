import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getCustomerMobileUser, listCustomerMobileBookings, unauthorizedResponse } from '../_lib';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(255),
  phone: z.string().trim().max(20).refine((value) => !value || (/^[+\d\s().-]{5,20}$/.test(value) && value.replace(/\D/g, '').length >= 5), 'Enter a valid phone number.').nullable(),
}).strict();

export async function PATCH(request: Request) {
  if (!request.headers.get('authorization')?.startsWith('Bearer ')) return unauthorizedResponse();
  try {
    const user = await getCustomerMobileUser(request);
    if (!user) return unauthorizedResponse();
    const parsed = profileSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid account details.' }, { status: 400 });
    const [profile] = await db.update(users).set({ name: parsed.data.name, phone: parsed.data.phone || null, updatedAt: new Date() })
      .where(and(eq(users.id, user.id), eq(users.role, 'customer')))
      .returning({ id: users.id, name: users.name, email: users.email, phone: users.phone, emailVerified: users.emailVerified });
    if (!profile) return unauthorizedResponse();
    return NextResponse.json({ profile: { ...profile, emailVerified: profile.emailVerified === true }, bookings: await listCustomerMobileBookings(user.id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to update your account. Please try again.' }, { status: 500 });
  }
}
