import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { db, users, accounts, drivers } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

// Extend NextAuth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: 'customer' | 'driver' | 'admin';
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: 'customer' | 'driver' | 'admin';
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { prompt: 'consent', access_type: 'offline' } },
    }),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);

        if (!user || !user.passwordHash) {
          return null;
        }

        const isValidPassword = await bcrypt.compare(password, user.passwordHash);

        if (!isValidPassword) {
          return null;
        }

        if (!user.emailVerified) {
          throw new Error('Please verify your email address');
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as 'customer' | 'driver' | 'admin',
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== 'google') return true;

      const email = user.email?.toLowerCase();
      if (!email) return false;

      // Check if user already exists
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing) {
        // Link Google account if not already linked
        const [existingAccount] = await db
          .select()
          .from(accounts)
          .where(
            and(
              eq(accounts.provider, 'google'),
              eq(accounts.userId, existing.id)
            )
          )
          .limit(1);

        if (!existingAccount) {
          await db.insert(accounts).values({
            userId: existing.id,
            type: account.type ?? 'oauth',
            provider: 'google',
            providerAccountId: account.providerAccountId,
            accessToken: account.access_token ?? null,
            refreshToken: account.refresh_token ?? null,
            expiresAt: account.expires_at ?? null,
            tokenType: account.token_type ?? null,
            scope: account.scope ?? null,
            idToken: account.id_token ?? null,
          });
        }

        return true;
      }

      // Create new customer from Google profile
      const [newUser] = await db
        .insert(users)
        .values({
          email,
          name: user.name ?? email.split('@')[0],
          role: 'customer',
          emailVerified: true,
        })
        .returning();

      await db.insert(accounts).values({
        userId: newUser.id,
        type: account.type ?? 'oauth',
        provider: 'google',
        providerAccountId: account.providerAccountId,
        accessToken: account.access_token ?? null,
        refreshToken: account.refresh_token ?? null,
        expiresAt: account.expires_at ?? null,
        tokenType: account.token_type ?? null,
        scope: account.scope ?? null,
        idToken: account.id_token ?? null,
      });

      return true;
    },
    async jwt({ token, user, account }) {
      if (user && account?.provider === 'credentials') {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = (user as { role: string }).role;
      } else if (account?.provider === 'google') {
        // Look up the user from DB to get id and role
        const email = token.email?.toLowerCase();
        if (email) {
          const [dbUser] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);
          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.role = token.role as 'customer' | 'driver' | 'admin';
      }
      return session;
    },
  },
});

// Helper functions for role-based access control
export async function requireAuth() {
  const session = await auth();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  if (session.user.role !== 'admin') {
    throw new Error('Forbidden: Admin access required');
  }
  return session;
}

export async function requireDriver() {
  const session = await requireAuth();
  if (session.user.role !== 'driver') {
    throw new Error('Forbidden: Driver access required');
  }
  return session;
}

export async function requireDriverOrAdmin() {
  const session = await requireAuth();
  if (session.user.role !== 'driver' && session.user.role !== 'admin') {
    throw new Error('Forbidden: Driver or Admin access required');
  }
  return session;
}

// Password hashing utility
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// Verify password utility
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

// ── Mobile JWT helpers ──

const MOBILE_JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET ?? 'fallback-secret',
);

export async function signMobileToken(payload: {
  id: string;
  email: string;
  name: string;
  role: string;
  driverId: string;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .setSubject(payload.id)
    .sign(MOBILE_JWT_SECRET);
}

export async function verifyMobileToken(token: string) {
  const { payload } = await jwtVerify(token, MOBILE_JWT_SECRET);
  return payload as { id: string; email: string; name: string; role: string; driverId: string; sub: string };
}

/** General auth helper that works for both web sessions and mobile Bearer tokens (any role) */
export async function authMobile(request?: Request) {
  // Try Bearer token first (mobile)
  if (request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = await verifyMobileToken(token);
        return {
          user: {
            id: payload.id,
            email: payload.email,
            name: payload.name,
            role: payload.role as 'customer' | 'driver' | 'admin',
          },
        };
      } catch {
        return null;
      }
    }
  }
  // Fall back to web session
  const session = await auth();
  return session;
}

/** Auth helper that works for both web sessions and mobile Bearer tokens (driver only) */
export async function requireDriverMobile(request?: Request) {
  // Try Bearer token first (mobile)
  if (request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = await verifyMobileToken(token);
        if (payload.role !== 'driver') throw new Error('Forbidden');
        return {
          user: {
            id: payload.id,
            email: payload.email,
            name: payload.name,
            role: 'driver' as const,
          },
          driverId: payload.driverId,
        };
      } catch {
        throw new Error('Unauthorized');
      }
    }
  }

  // Fall back to web session
  const session = await requireDriver();
  const [driver] = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.userId, session.user.id))
    .limit(1);
  if (!driver) throw new Error('Driver record not found');
  return { user: session.user, driverId: driver.id };
}
