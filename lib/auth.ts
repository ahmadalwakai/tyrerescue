import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { db, users } from '@/lib/db';
import { eq } from 'drizzle-orm';

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

        if (!user) {
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = (user as { role: string }).role;
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
