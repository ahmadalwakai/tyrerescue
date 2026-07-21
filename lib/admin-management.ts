import crypto from 'crypto';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { getOutboundUrl } from '@/lib/config/site';
import { normalizeCustomerPhoneInput, normalizeRecipientEmailInput } from '@/lib/contact-normalization';
import { db, auditLogs, cookieSettings, passwordResetTokens, users } from '@/lib/db';
import { createNotificationAndSend } from '@/lib/email/resend';
import { resetPassword } from '@/lib/email/templates';
import { validateRecipientEmail } from '@/lib/email/validate-recipient';
import { hashPassword, verifyPassword } from '@/lib/password-hashing';
import { getClientIp, getUserAgent } from '@/lib/security/request-meta';

export const ADD_ADMIN_SECURITY_SETTING_PREFIX = 'security.';
export const ADD_ADMIN_PIN_HASH_SETTING_KEY = `${ADD_ADMIN_SECURITY_SETTING_PREFIX}add_admin_pin_hash`;
export const ADD_ADMIN_PIN_LENGTH = 4;
export const ADD_ADMIN_UNLOCK_TTL_MS = 5 * 60_000;
export const ADD_ADMIN_UNLOCK_IDLE_MS = 2 * 60_000;
export const ADD_ADMIN_ALLOWED_ROLES = ['admin'] as const;

export type AddAdminAllowedRole = (typeof ADD_ADMIN_ALLOWED_ROLES)[number];

export const addAdminUnlockSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'Security PIN is incorrect.'),
});

export const createAdminUserSchema = z.object({
  unlockToken: z.string().min(32).max(256),
  name: z.string().transform((value) => value.trim()).pipe(z.string().min(2).max(255)),
  email: z
    .string()
    .transform((value) => normalizeRecipientEmailInput(value))
    .pipe(z.string().email().max(255)),
  phone: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => normalizeCustomerPhoneInput(value ?? ''))
    .pipe(z.string().max(20)),
  role: z.enum(ADD_ADMIN_ALLOWED_ROLES),
});

export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;

export class AdminManagementError extends Error {
  code: string;
  status: number;
  fieldErrors?: Record<string, string[]>;

  constructor(message: string, status: number, code: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = 'AdminManagementError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

interface UnlockSession {
  adminId: string;
  createdAt: number;
  expiresAt: number;
  idleExpiresAt: number;
}

interface PinFailureState {
  count: number;
  firstFailureAt: number;
  lastFailureAt: number;
  cooldownUntil: number;
}

const unlockSessions = new Map<string, UnlockSession>();
const pinFailures = new Map<string, PinFailureState>();

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function cleanupUnlockSessions(now: number): void {
  for (const [tokenHash, session] of unlockSessions) {
    if (isUnlockSessionExpired(session, now)) unlockSessions.delete(tokenHash);
  }
}

export function isProtectedSecuritySettingKey(key: string): boolean {
  return key.trim().toLowerCase().startsWith(ADD_ADMIN_SECURITY_SETTING_PREFIX);
}

export function isSupportedAdminCreationRole(role: string): role is AddAdminAllowedRole {
  return ADD_ADMIN_ALLOWED_ROLES.includes(role as AddAdminAllowedRole);
}

export function canAdminCreateRole(creatorRole: string, requestedRole: string): boolean {
  return creatorRole === 'admin' && requestedRole === 'admin';
}

export function getCooldownMsForAddAdminPinFailureCount(count: number): number {
  if (count >= 8) return 15 * 60_000;
  if (count >= 5) return 5 * 60_000;
  if (count >= 3) return 60_000;
  return 0;
}

export function getAddAdminPinCooldownMs(key: string, now = Date.now()): number {
  const state = pinFailures.get(key);
  if (!state || state.cooldownUntil <= now) return 0;
  return state.cooldownUntil - now;
}

export function recordAddAdminPinFailure(key: string, now = Date.now()): PinFailureState {
  const existing = pinFailures.get(key);
  const firstFailureAt = existing && now - existing.firstFailureAt < 30 * 60_000 ? existing.firstFailureAt : now;
  const count = existing && now - existing.firstFailureAt < 30 * 60_000 ? existing.count + 1 : 1;
  const cooldownMs = getCooldownMsForAddAdminPinFailureCount(count);
  const next: PinFailureState = {
    count,
    firstFailureAt,
    lastFailureAt: now,
    cooldownUntil: cooldownMs > 0 ? now + cooldownMs : 0,
  };
  pinFailures.set(key, next);
  return next;
}

export function resetAddAdminPinFailures(key: string): void {
  pinFailures.delete(key);
}

export function issueAddAdminUnlock(adminId: string, now = Date.now()): { token: string; expiresAt: Date } {
  cleanupUnlockSessions(now);
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = now + ADD_ADMIN_UNLOCK_TTL_MS;
  unlockSessions.set(hashToken(token), {
    adminId,
    createdAt: now,
    expiresAt,
    idleExpiresAt: now + ADD_ADMIN_UNLOCK_IDLE_MS,
  });
  return { token, expiresAt: new Date(expiresAt) };
}

export function isUnlockSessionExpired(session: UnlockSession, now = Date.now()): boolean {
  return session.expiresAt <= now || session.idleExpiresAt <= now;
}

export function verifyAddAdminUnlock(adminId: string, token: string, now = Date.now()): boolean {
  cleanupUnlockSessions(now);
  const tokenHash = hashToken(token);
  const session = unlockSessions.get(tokenHash);
  if (!session || session.adminId !== adminId || isUnlockSessionExpired(session, now)) {
    unlockSessions.delete(tokenHash);
    return false;
  }
  session.idleExpiresAt = Math.min(session.expiresAt, now + ADD_ADMIN_UNLOCK_IDLE_MS);
  return true;
}

export function revokeAddAdminUnlock(adminId: string, token: string): void {
  const tokenHash = hashToken(token);
  const session = unlockSessions.get(tokenHash);
  if (session?.adminId === adminId) unlockSessions.delete(tokenHash);
}

export function buildAddAdminAttemptKey(params: { adminId: string; ip: string; userAgent: string }): string {
  const uaHash = crypto.createHash('sha256').update(params.userAgent).digest('hex').slice(0, 16);
  return `add-admin-pin:${params.adminId}:${params.ip}:${uaHash}`;
}

export async function getOwnerLevelAdmin() {
  const [owner] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(sql`${users.role} = 'admin' AND ${users.emailVerified} IS TRUE`)
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(1);

  return owner ?? null;
}

export async function isOwnerLevelAdmin(adminId: string): Promise<boolean> {
  const owner = await getOwnerLevelAdmin();
  return owner?.id === adminId;
}

export async function getAddAdminPinHash(): Promise<string | null> {
  const [setting] = await db
    .select({ value: cookieSettings.value })
    .from(cookieSettings)
    .where(eq(cookieSettings.key, ADD_ADMIN_PIN_HASH_SETTING_KEY))
    .limit(1);

  return setting?.value ?? null;
}

export async function storeInitialAddAdminPinHash(pin: string, actorUserId: string, request: Request): Promise<string> {
  const hashedPin = await hashPassword(pin);
  const now = new Date();

  await db
    .insert(cookieSettings)
    .values({
      key: ADD_ADMIN_PIN_HASH_SETTING_KEY,
      value: hashedPin,
      label: 'Add Admin security PIN hash',
      description: 'Internal protected security setting. Stores only a salted hash.',
      updatedBy: actorUserId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: cookieSettings.key,
      set: {
        value: hashedPin,
        updatedBy: actorUserId,
        updatedAt: now,
      },
    });

  await recordAdminManagementAudit({
    request,
    actorUserId,
    action: 'add_admin_pin_configured',
    afterJson: { configured: true },
  });

  return hashedPin;
}

export async function verifyOrBootstrapAddAdminPin(params: {
  pin: string;
  actorUserId: string;
  request: Request;
}): Promise<{ ok: boolean; bootstrapped: boolean }> {
  const existingHash = await getAddAdminPinHash();
  if (!existingHash) {
    await storeInitialAddAdminPinHash(params.pin, params.actorUserId, params.request);
    return { ok: true, bootstrapped: true };
  }

  return { ok: await verifyPassword(params.pin, existingHash), bootstrapped: false };
}

export async function recordAdminManagementAudit(params: {
  request: Request;
  actorUserId: string | null;
  action: string;
  entityId?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
}): Promise<void> {
  const ipAddress = getClientIp(params.request);
  await db.insert(auditLogs).values({
    actorUserId: params.actorUserId,
    actorRole: params.actorUserId ? 'admin' : 'system',
    entityType: 'admin_user',
    entityId: params.entityId ?? null,
    action: params.action,
    beforeJson: params.beforeJson ?? null,
    afterJson: params.afterJson ?? null,
    ipAddress: ipAddress === 'unknown' ? null : ipAddress,
    userAgent: getUserAgent(params.request),
  });
}

export async function createAdminAccount(params: {
  input: CreateAdminUserInput;
  creator: { id: string; role: string };
  request: Request;
}): Promise<{ id: string; name: string; email: string; role: AddAdminAllowedRole; passwordSetupEmailSent: boolean }> {
  const { input, creator, request } = params;

  if (!canAdminCreateRole(creator.role, input.role)) {
    throw new AdminManagementError('Unsupported admin role.', 403, 'INVALID_ROLE', {
      role: ['Unsupported admin role.'],
    });
  }

  const emailCheck = validateRecipientEmail(input.email);
  if (!emailCheck.ok) {
    throw new AdminManagementError('Please enter a valid email address.', 400, 'VALIDATION_ERROR', {
      email: [emailCheck.reason],
    });
  }

  const email = emailCheck.email;
  const phone = input.phone || null;

  const [duplicateEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (duplicateEmail) {
    throw new AdminManagementError('An admin with this email already exists.', 409, 'DUPLICATE_EMAIL', {
      email: ['An account with this email already exists.'],
    });
  }

  if (phone) {
    const phoneRows = await db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(sql`${users.phone} IS NOT NULL AND ${users.phone} <> ''`);
    const duplicatePhone = phoneRows.find((row) => normalizeCustomerPhoneInput(row.phone ?? '') === phone);
    if (duplicatePhone) {
      throw new AdminManagementError('An account with this phone number already exists.', 409, 'DUPLICATE_PHONE', {
        phone: ['An account with this phone number already exists.'],
      });
    }
  }

  let temporaryPassword = crypto.randomBytes(32).toString('base64url');
  const passwordHash = await hashPassword(temporaryPassword);
  temporaryPassword = '';

  const [created] = await db
    .insert(users)
    .values({
      name: input.name,
      email,
      phone,
      role: input.role,
      emailVerified: true,
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

  if (!created) {
    throw new AdminManagementError('Failed to create admin account.', 500, 'CREATE_FAILED');
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db.insert(passwordResetTokens).values({
    userId: created.id,
    tokenHash,
    expiresAt,
    used: false,
  });

  await recordAdminManagementAudit({
    request,
    actorUserId: creator.id,
    action: 'admin_account_created',
    entityId: created.id,
    afterJson: {
      createdAdminId: created.id,
      createdAdminEmail: created.email,
      createdAdminRole: created.role,
      creatorAdminId: creator.id,
    },
  });

  let passwordSetupEmailSent = false;
  try {
    const resetUrl = `${getOutboundUrl()}/reset-password/${token}`;
    const resetEmail = resetPassword({
      name: created.name || 'Admin',
      resetUrl,
    });

    const result = await createNotificationAndSend({
      to: created.email,
      subject: resetEmail.subject,
      html: resetEmail.html,
      type: 'admin-password-setup',
      userId: created.id,
    });
    passwordSetupEmailSent = result.success;
  } catch {
    passwordSetupEmailSent = false;
  }

  return {
    id: created.id,
    name: created.name,
    email: created.email,
    role: 'admin',
    passwordSetupEmailSent,
  };
}

export function _resetAddAdminSecurityForTests(): void {
  unlockSessions.clear();
  pinFailures.clear();
}
