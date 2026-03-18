import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, users, drivers } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { signMobileToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, String(email).toLowerCase()))
      .limit(1);

    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const valid = await bcrypt.compare(String(password), user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (user.role !== 'driver') {
      return NextResponse.json({ error: 'This app is for drivers only' }, { status: 403 });
    }

    if (!user.emailVerified) {
      return NextResponse.json({ error: 'Please verify your email address first' }, { status: 403 });
    }

    // Get driver record
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.userId, user.id))
      .limit(1);

    if (!driver) {
      return NextResponse.json({ error: 'Driver profile not found. Contact your administrator.' }, { status: 403 });
    }

    const token = await signMobileToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      driverId: driver.id,
    });

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        driverId: driver.id,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
