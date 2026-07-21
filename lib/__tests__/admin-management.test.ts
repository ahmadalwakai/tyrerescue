import { describe, expect, it, beforeEach } from 'vitest';

let adminManagement: typeof import('../admin-management');

describe('admin management security helpers', () => {
  beforeEach(async () => {
    process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/tyrerescue_test';
    adminManagement = await import('../admin-management');
    adminManagement._resetAddAdminSecurityForTests();
  });

  it('protects internal security settings from generic admin settings screens', () => {
    expect(adminManagement.isProtectedSecuritySettingKey('security.add_admin_pin_hash')).toBe(true);
    expect(adminManagement.isProtectedSecuritySettingKey(' SECURITY.anything ')).toBe(true);
    expect(adminManagement.isProtectedSecuritySettingKey('cookie_banner_enabled')).toBe(false);
  });

  it('only allows creating supported existing admin roles', () => {
    expect(adminManagement.isSupportedAdminCreationRole('admin')).toBe(true);
    expect(adminManagement.isSupportedAdminCreationRole('owner')).toBe(false);
    expect(adminManagement.isSupportedAdminCreationRole('super_admin')).toBe(false);
    expect(adminManagement.canAdminCreateRole('admin', 'admin')).toBe(true);
    expect(adminManagement.canAdminCreateRole('admin', 'owner')).toBe(false);
    expect(adminManagement.canAdminCreateRole('driver', 'admin')).toBe(false);
  });

  it('normalizes admin form input and rejects invalid roles', () => {
    const parsed = adminManagement.createAdminUserSchema.safeParse({
      unlockToken: 'x'.repeat(40),
      name: '  Jane Admin  ',
      email: '  Jane.Admin@Example.COM. ',
      phone: '  +44 (0)7901 234567  ',
      role: 'admin',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe('Jane Admin');
      expect(parsed.data.email).toBe('jane.admin@example.com');
      expect(parsed.data.phone).toBe('+447901234567');
    }

    expect(adminManagement.createAdminUserSchema.safeParse({
      unlockToken: 'x'.repeat(40),
      name: 'Jane Admin',
      email: 'jane@example.com',
      phone: '',
      role: 'owner',
    }).success).toBe(false);
  });

  it('uses increasing cooldowns after repeated PIN failures', () => {
    expect(adminManagement.getCooldownMsForAddAdminPinFailureCount(1)).toBe(0);
    expect(adminManagement.getCooldownMsForAddAdminPinFailureCount(3)).toBe(60_000);
    expect(adminManagement.getCooldownMsForAddAdminPinFailureCount(5)).toBe(5 * 60_000);
    expect(adminManagement.getCooldownMsForAddAdminPinFailureCount(8)).toBe(15 * 60_000);

    const key = 'admin-a/device-a';
    adminManagement.recordAddAdminPinFailure(key, 1_000);
    adminManagement.recordAddAdminPinFailure(key, 2_000);
    expect(adminManagement.getAddAdminPinCooldownMs(key, 2_500)).toBe(0);
    adminManagement.recordAddAdminPinFailure(key, 3_000);
    expect(adminManagement.getAddAdminPinCooldownMs(key, 3_000)).toBe(60_000);
    adminManagement.resetAddAdminPinFailures(key);
    expect(adminManagement.getAddAdminPinCooldownMs(key, 3_000)).toBe(0);
  });

  it('issues temporary unlocks that expire by ttl, idle timeout, admin mismatch, or close', () => {
    const adminId = '11111111-1111-4111-8111-111111111111';
    const issued = adminManagement.issueAddAdminUnlock(adminId, 10_000);

    expect(issued.token).not.toContain('1234');
    expect(adminManagement.verifyAddAdminUnlock(adminId, issued.token, 10_001)).toBe(true);
    expect(adminManagement.verifyAddAdminUnlock('22222222-2222-4222-8222-222222222222', issued.token, 10_002)).toBe(false);

    const idleIssued = adminManagement.issueAddAdminUnlock(adminId, 20_000);
    expect(adminManagement.verifyAddAdminUnlock(adminId, idleIssued.token, 20_000 + adminManagement.ADD_ADMIN_UNLOCK_IDLE_MS + 1)).toBe(false);

    const ttlIssued = adminManagement.issueAddAdminUnlock(adminId, 30_000);
    expect(adminManagement.verifyAddAdminUnlock(adminId, ttlIssued.token, 30_000 + adminManagement.ADD_ADMIN_UNLOCK_TTL_MS + 1)).toBe(false);

    const revoked = adminManagement.issueAddAdminUnlock(adminId, 40_000);
    adminManagement.revokeAddAdminUnlock(adminId, revoked.token);
    expect(adminManagement.verifyAddAdminUnlock(adminId, revoked.token, 40_001)).toBe(false);
  });

  it('keys PIN attempts by admin and device/session metadata without exposing PIN values', () => {
    const key = adminManagement.buildAddAdminAttemptKey({
      adminId: 'admin-a',
      ip: '127.0.0.1',
      userAgent: 'Test Browser',
    });

    expect(key).toContain('admin-a');
    expect(key).toContain('127.0.0.1');
    expect(key).not.toContain('Test Browser');
    expect(key).not.toContain('1234');
  });
});
