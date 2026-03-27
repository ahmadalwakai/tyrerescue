import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { signMobileToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email || '').toLowerCase().trim();
    const password = String(body?.password || '');

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'This app is for administrators only' }, { status: 403 });
    }

    if (!user.emailVerified) {
      return NextResponse.json({ error: 'Please verify your email before signing in' }, { status: 403 });
    }

    const token = await signMobileToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'admin',
    });

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'admin',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
