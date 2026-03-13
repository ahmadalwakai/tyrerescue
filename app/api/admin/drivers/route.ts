import { NextResponse } from 'next/server';
import { requireAdmin, hashPassword } from '@/lib/auth';
import { db, users, drivers } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { createNotificationAndSend } from '@/lib/email/resend';
import { driverWelcome } from '@/lib/email/templates';

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const { name, email, phone, password } = await request.json();

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400 }
      );
    }

    if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user with driver role
    const [newUser] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        name: name.trim(),
        phone: phone.trim(),
        role: 'driver',
        emailVerified: true, // Admin-created accounts are pre-verified
      })
      .returning({ id: users.id });

    if (!newUser) {
      return NextResponse.json(
        { error: 'Failed to create user account' },
        { status: 500 }
      );
    }

    // Create driver record
    const [newDriver] = await db
      .insert(drivers)
      .values({
        userId: newUser.id,
        createdBy: session.user.id,
        isOnline: false,
        status: 'offline',
      })
      .returning({ id: drivers.id });

    // Send welcome email to driver with credentials
    try {
      const baseUrl = process.env.NEXTAUTH_URL || 'https://tyrerescue.uk';
      const welcomeEmail = driverWelcome({
        name: name.trim(),
        email: email.toLowerCase(),
        password, // Send plain password - only sent once at account creation
        portalUrl: `${baseUrl}/driver`,
      });

      await createNotificationAndSend({
        to: email.toLowerCase(),
        subject: welcomeEmail.subject,
        html: welcomeEmail.html,
        type: 'driver-welcome',
        userId: newUser.id,
      });
    } catch (emailError) {
      console.error('Failed to send driver welcome email:', emailError);
    }

    return NextResponse.json({
      success: true,
      driver: {
        id: newDriver.id,
        userId: newUser.id,
        name: name.trim(),
        email: email.toLowerCase(),
      },
    });
  } catch (error) {
    console.error('Error creating driver:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create driver' },
      { status: 500 }
    );
  }
}
