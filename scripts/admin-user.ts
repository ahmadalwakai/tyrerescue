/**
 * Local-only admin user inspection / creation script.
 *
 * Usage (run from repo root, against .env.local):
 *
 *   List admin users (no password hashes printed):
 *     npm run admin:list
 *
 *   Create or update an admin user (password from env or CLI):
 *     # email/password from env (preferred):
 *     $env:ADMIN_EMAIL='you@example.com'; $env:ADMIN_PASSWORD='your-password'
 *     npm run admin:create
 *
 *     # or CLI args:
 *     npm run admin:create -- --email you@example.com --password your-password
 *
 * Notes:
 * - Reuses the existing `hashPassword` helper from lib/auth.ts (bcrypt, cost 12).
 * - Sets role='admin' and emailVerified=true so the mobile login endpoint
 *   (/api/mobile/admin/auth/login) accepts the account.
 * - If the user already exists, only password / role / emailVerified are updated.
 *   Name is left untouched unless creating a new row.
 * - Never prints the password or password hash.
 */

import { db, users } from '../lib/db';
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from '../lib/auth';

type Mode = 'list' | 'create';

interface Args {
  mode: Mode;
  email?: string;
  password?: string;
  name?: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const mode: Mode = argv.includes('--list') ? 'list' : 'create';

  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')
      ? argv[i + 1]
      : undefined;
  };

  return {
    mode,
    email: (get('--email') ?? process.env.ADMIN_EMAIL ?? '').toLowerCase().trim() || undefined,
    password: get('--password') ?? process.env.ADMIN_PASSWORD,
    name: get('--name') ?? process.env.ADMIN_NAME ?? 'Admin',
  };
}

async function listAdmins() {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      hasPasswordHash: sql<boolean>`${users.passwordHash} IS NOT NULL`,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.role, 'admin'));

  console.log(`Found ${rows.length} admin user(s):`);
  for (const r of rows) {
    console.log(
      `  - ${r.email}  (id=${r.id}, hasPasswordHash=${r.hasPasswordHash}, emailVerified=${r.emailVerified})`,
    );
  }
}

async function createOrUpdateAdmin(email: string, password: string, name: string) {
  if (!email || !password) {
    console.error('Error: email and password are required.');
    console.error('Provide via env (ADMIN_EMAIL / ADMIN_PASSWORD) or --email / --password.');
    process.exit(2);
  }
  if (password.length < 8) {
    console.error('Error: password must be at least 8 characters.');
    process.exit(2);
  }

  const passwordHash = await hashPassword(password);

  const [existing] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        passwordHash,
        role: 'admin',
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    console.log(`Updated existing user → admin: ${email}`);
  } else {
    await db.insert(users).values({
      email,
      passwordHash,
      name,
      role: 'admin',
      emailVerified: true,
    });
    console.log(`Created new admin user: ${email}`);
  }
}

async function main() {
  const args = parseArgs();
  if (args.mode === 'list') {
    await listAdmins();
  } else {
    await createOrUpdateAdmin(args.email ?? '', args.password ?? '', args.name ?? 'Admin');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
