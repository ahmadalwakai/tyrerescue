import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users, emailVerificationTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { createNotificationAndSend } from '@/lib/email/resend';
import { welcome, verifyEmail } from '@/lib/email/templates';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  phone: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validation = registerSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, password, phone } = validation.data;

    // Check if email already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        name,
        email: email.toLowerCase(),
        passwordHash,
        phone: phone || null,
        role: 'customer',
        emailVerified: false,
      })
      .returning({ id: users.id, name: users.name, email: users.email });

    // Generate email verification token
    const verifyToken = uuidv4();
    const tokenHash = require('crypto').createHash('sha256').update(verifyToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.insert(emailVerificationTokens).values({
      userId: newUser.id,
      tokenHash,
      expiresAt,
    });

    const baseUrl = process.env.NEXTAUTH_URL || 'https://tyrerescue.uk';
    const verifyUrl = `${baseUrl}/verify-email/${verifyToken}`;

    // Send welcome email
    try {
      const welcomeEmail = welcome({
        name: newUser.name || 'Customer',
        verifyUrl,
      });

      await createNotificationAndSend({
        to: newUser.email,
        subject: welcomeEmail.subject,
        html: welcomeEmail.html,
        type: 'welcome',
        userId: newUser.id,
      });
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }

    // Send verification email
    try {
      const verifyEmailContent = verifyEmail({
        name: newUser.name || 'Customer',
        verifyUrl,
      });

      await createNotificationAndSend({
        to: newUser.email,
        subject: verifyEmailContent.subject,
        html: verifyEmailContent.html,
        type: 'verify-email',
        userId: newUser.id,
      });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
    }

    return NextResponse.json({
      success: true,
      message: 'Account created successfully. Please check your email to verify your account.',
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}
