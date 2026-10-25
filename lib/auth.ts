// IMPORTANT: this side-effect import must run before NextAuth() is called so
// it can sanitize AUTH_URL / NEXTAUTH_URL in production. Without it, a stale
// `NEXTAUTH_URL=http://localhost:3002` in Vercel env would make Google OAuth
// redirect real users to localhost.
import '@/lib/config/auth-url-guard';

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { db, users, accounts, drivers } from '@/lib/db';
import { errors as joseErrors } from 'jose';
import { signMobileToken, verifySignedMobileToken } from './auth/mobile-token';
import { decideGoogleSignIn } from './auth/google-link';
import { eq, and } from 'drizzle-orm';
import {
  hashPassword as hashPasswordValue,
  verifyPassword as verifyPasswordValue,
} from './password-hashing';

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
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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

        const isValidPassword = await verifyPasswordValue(password, user.passwordHash);

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
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'google') return true;

      const email = user.email?.toLowerCase();
      if (!email) return false;

      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      const [linked] = existing
        ? await db
            .select({ providerAccountId: accounts.providerAccountId })
            .from(accounts)
            .where(and(eq(accounts.provider, 'google'), eq(accounts.userId, existing.id)))
            .limit(1)
        : [];

      const decision = decideGoogleSignIn({
        emailVerifiedByGoogle: profile?.email_verified === true,
        existingUser: existing ?? null,
        linkedGoogleAccountId: linked?.providerAccountId ?? null,
        providerAccountId: account.providerAccountId,
      });
      if (decision === 'deny') return false;
      if (decision === 'allow') return true;

      // Sign-in only needs the Google identity, so no OAuth tokens are stored.
      const accountRow = {
        type: account.type ?? 'oauth',
        provider: 'google',
        providerAccountId: account.providerAccountId,
      };

      if (decision === 'link') {
        await db.insert(accounts).values({ ...accountRow, userId: existing!.id });
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

      await db.insert(accounts).values({ ...accountRow, userId: newUser.id });

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
      if (token.role === 'customer') {
        const [customer] = await db.select({ id: users.id }).from(users)
          .where(and(eq(users.id, token.id as string), eq(users.role, 'customer'))).limit(1);
        if (!customer) return null;
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
  return hashPasswordValue(password);
}

// Verify password utility
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return verifyPasswordValue(password, hashedPassword);
}

// ── Mobile JWT helpers ──

export { signMobileToken };

export async function verifyMobileToken(token: string) {
  if (token.startsWith('dcs_v1.')) {
    const { verifyDriverDeviceSession } = await import('./auth/driver-device-sessions');
    return verifyDriverDeviceSession(token);
  }
  if (token.startsWith('acs_v1.')) {
    const { verifyAdminDeviceSession } = await import('./auth/admin-device-sessions');
    return verifyAdminDeviceSession(token);
  }
  const payload = await verifySignedMobileToken(token);

  // A signed token stays valid for 7 days, so re-check staff accounts on every
  // use: removing the admin/driver role (or the driver record) must lock the
  // app out immediately, as it already does for device-session tokens.
  // A revoked account is a JOSE error (callers answer 401); a database
  // failure propagates unchanged so callers answer 5xx, never a false 401.
  if (payload.role === 'driver') {
    const { getCurrentDriverSessionUser, DriverDeviceSessionUnauthorizedError } = await import('./auth/driver-device-sessions');
    try {
      return await getCurrentDriverSessionUser(payload.id, payload.driverId);
    } catch (error) {
      if (error instanceof DriverDeviceSessionUnauthorizedError) throw new joseErrors.JWTInvalid('Driver account is no longer active');
      throw error;
    }
  }
  if (payload.role === 'admin') {
    const [admin] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.id, payload.id), eq(users.role, 'admin'), eq(users.emailVerified, true))).limit(1);
    if (!admin) throw new joseErrors.JWTInvalid('Admin account is no longer active');
  }
  return payload;
}

/** True for an invalid/revoked credential; false for infrastructure failures. */
async function isMobileAuthRejection(error: unknown): Promise<boolean> {
  if (error instanceof joseErrors.JOSEError) return true;
  const [{ DriverDeviceSessionUnauthorizedError }, { AdminDeviceSessionUnauthorizedError }] = await Promise.all([
    import('./auth/driver-device-sessions'),
    import('./auth/admin-device-sessions'),
  ]);
  return error instanceof DriverDeviceSessionUnauthorizedError || error instanceof AdminDeviceSessionUnauthorizedError;
}

/** General auth helper that works for both web sessions and mobile Bearer tokens (any role) */
export async function authMobile(request?: Request) {
  // Try Bearer token first (mobile)
  if (request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      let payload: Awaited<ReturnType<typeof verifyMobileToken>>;
      try {
        payload = await verifyMobileToken(token);
      } catch (error) {
        if (await isMobileAuthRejection(error)) return null;
        throw error;
      }
      // A database outage must remain a server failure, never a false 401 that
      // would erase an otherwise valid offline customer session.
      if (payload.role === 'customer') {
        const [customer] = await db.select({ id: users.id }).from(users)
          .where(and(eq(users.id, payload.id), eq(users.role, 'customer'))).limit(1);
        if (!customer) return null;
      }
      return { user: { id: payload.id, email: payload.email, name: payload.name, role: payload.role as 'customer' | 'driver' | 'admin' } };
    }
  }
  // Fall back to web session
  const session = await auth();
  if (session?.user.role === 'customer') {
    const [customer] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.id, session.user.id), eq(users.role, 'customer'))).limit(1);
    if (!customer) return null;
  }
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
        if (!payload.driverId) throw new Error('Unauthorized');
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

/** Auth helper that works for web session and mobile Bearer tokens (admin only) */
export async function requireAdminMobile(request?: Request) {
  // Try Bearer token first (mobile)
  if (request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = await verifyMobileToken(token);
        if (payload.role !== 'admin') throw new Error('Forbidden');
        return {
          user: {
            id: payload.id,
            email: payload.email,
            name: payload.name,
            role: 'admin' as const,
          },
        };
      } catch {
        throw new Error('Unauthorized');
      }
    }
  }

  // Fall back to web session
  const session = await requireAdmin();
  return { user: session.user };
}
