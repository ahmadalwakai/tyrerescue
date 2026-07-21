import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
  class MockAdminManagementError extends Error {
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

  return {
    getMobileAdminUser: vi.fn(),
    isOwnerLevelAdmin: vi.fn(),
    recordAdminManagementAudit: vi.fn(),
    getAddAdminPinHash: vi.fn(),
    verifyAddAdminUnlock: vi.fn(),
    createAdminAccount: vi.fn(),
    buildAddAdminAttemptKey: vi.fn(),
    getAddAdminPinCooldownMs: vi.fn(),
    recordAddAdminPinFailure: vi.fn(),
    resetAddAdminPinFailures: vi.fn(),
    verifyOrBootstrapAddAdminPin: vi.fn(),
    issueAddAdminUnlock: vi.fn(),
    revokeAddAdminUnlock: vi.fn(),
    AdminManagementError: MockAdminManagementError,
  };
});

vi.mock('@/app/api/mobile/admin/_lib', async () => {
  const { NextResponse } = await import('next/server');
  return {
    getMobileAdminUser: mockState.getMobileAdminUser,
    unauthorizedResponse: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  };
});

vi.mock('@/lib/admin-management', async () => {
  const { z } = await import('zod');
  return {
    ADD_ADMIN_ALLOWED_ROLES: ['admin'],
    AdminManagementError: mockState.AdminManagementError,
    createAdminUserSchema: z.object({
      unlockToken: z.string().min(32),
      name: z.string().min(2),
      email: z.string().email(),
      phone: z.string().optional().default(''),
      role: z.enum(['admin']),
    }),
    addAdminUnlockSchema: z.object({
      pin: z.string().regex(/^\d{4}$/),
    }),
    getMobileAdminUser: mockState.getMobileAdminUser,
    isOwnerLevelAdmin: mockState.isOwnerLevelAdmin,
    recordAdminManagementAudit: mockState.recordAdminManagementAudit,
    getAddAdminPinHash: mockState.getAddAdminPinHash,
    verifyAddAdminUnlock: mockState.verifyAddAdminUnlock,
    createAdminAccount: mockState.createAdminAccount,
    buildAddAdminAttemptKey: mockState.buildAddAdminAttemptKey,
    getAddAdminPinCooldownMs: mockState.getAddAdminPinCooldownMs,
    recordAddAdminPinFailure: mockState.recordAddAdminPinFailure,
    resetAddAdminPinFailures: mockState.resetAddAdminPinFailures,
    verifyOrBootstrapAddAdminPin: mockState.verifyOrBootstrapAddAdminPin,
    issueAddAdminUnlock: mockState.issueAddAdminUnlock,
    revokeAddAdminUnlock: mockState.revokeAddAdminUnlock,
  };
});

vi.mock('@/lib/security', async () => ({
  RATE_LIMITS: { adminAddAdminPin: { limit: 5, windowMs: 600_000 } },
  checkRateLimit: vi.fn(() => ({ ok: true, remaining: 4, retryAfterSeconds: 0 })),
}));

describe('mobile Add Admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.getMobileAdminUser.mockResolvedValue({ id: 'admin-a', role: 'admin' });
    mockState.isOwnerLevelAdmin.mockResolvedValue(true);
    mockState.recordAdminManagementAudit.mockResolvedValue(undefined);
    mockState.getAddAdminPinHash.mockResolvedValue('hash');
    mockState.verifyAddAdminUnlock.mockReturnValue(true);
    mockState.buildAddAdminAttemptKey.mockReturnValue('attempt-key');
    mockState.getAddAdminPinCooldownMs.mockReturnValue(0);
    mockState.recordAddAdminPinFailure.mockReturnValue({ count: 1, cooldownUntil: 0 });
    mockState.verifyOrBootstrapAddAdminPin.mockResolvedValue({ ok: true, bootstrapped: false });
    mockState.issueAddAdminUnlock.mockReturnValue({
      token: 'unlock-token-that-is-long-enough-for-tests',
      expiresAt: new Date('2026-07-20T12:05:00.000Z'),
    });
    mockState.createAdminAccount.mockResolvedValue({
      id: 'admin-b',
      name: 'Admin B',
      email: 'admin-b@example.com',
      role: 'admin',
      passwordSetupEmailSent: true,
    });
  });

  it('rejects unauthenticated users before exposing Add Admin status', async () => {
    mockState.getMobileAdminUser.mockResolvedValueOnce(null);
    const { GET } = await import('../../app/api/mobile/admin/add-admin/route');

    const response = await GET(new Request('http://test.local/api/mobile/admin/add-admin'));

    expect(response.status).toBe(401);
  });

  it('forbids normal admins even when they manually call the create endpoint', async () => {
    mockState.isOwnerLevelAdmin.mockResolvedValueOnce(false);
    const { POST } = await import('../../app/api/mobile/admin/add-admin/route');

    const response = await POST(new Request('http://test.local/api/mobile/admin/add-admin', {
      method: 'POST',
      body: JSON.stringify({
        unlockToken: 'x'.repeat(40),
        name: 'Admin B',
        email: 'admin-b@example.com',
        phone: '',
        role: 'admin',
      }),
    }));

    expect(response.status).toBe(403);
    expect(mockState.createAdminAccount).not.toHaveBeenCalled();
  });

  it('requires a live server-side unlock before creating an admin', async () => {
    mockState.verifyAddAdminUnlock.mockReturnValueOnce(false);
    const { POST } = await import('../../app/api/mobile/admin/add-admin/route');

    const response = await POST(new Request('http://test.local/api/mobile/admin/add-admin', {
      method: 'POST',
      body: JSON.stringify({
        unlockToken: 'x'.repeat(40),
        name: 'Admin B',
        email: 'admin-b@example.com',
        phone: '',
        role: 'admin',
      }),
    }));
    const body = await response.json() as { code?: string };

    expect(response.status).toBe(403);
    expect(body.code).toBe('UNLOCK_EXPIRED');
    expect(mockState.createAdminAccount).not.toHaveBeenCalled();
  });

  it('passes creator identity into admin creation and returns no PIN data', async () => {
    const { POST } = await import('../../app/api/mobile/admin/add-admin/route');

    const response = await POST(new Request('http://test.local/api/mobile/admin/add-admin', {
      method: 'POST',
      body: JSON.stringify({
        unlockToken: 'x'.repeat(40),
        name: 'Admin B',
        email: 'admin-b@example.com',
        phone: '',
        role: 'admin',
      }),
    }));
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(mockState.createAdminAccount).toHaveBeenCalledWith(expect.objectContaining({
      creator: { id: 'admin-a', role: 'admin' },
    }));
    expect(JSON.stringify(body)).not.toContain('1234');
    expect(JSON.stringify(body)).not.toContain('hash');
  });

  it('rejects duplicate admins through the backend error path', async () => {
    mockState.createAdminAccount.mockRejectedValueOnce(
      new mockState.AdminManagementError('An admin with this email already exists.', 409, 'DUPLICATE_EMAIL', {
        email: ['An account with this email already exists.'],
      }),
    );
    const { POST } = await import('../../app/api/mobile/admin/add-admin/route');

    const response = await POST(new Request('http://test.local/api/mobile/admin/add-admin', {
      method: 'POST',
      body: JSON.stringify({
        unlockToken: 'x'.repeat(40),
        name: 'Admin B',
        email: 'admin-b@example.com',
        phone: '',
        role: 'admin',
      }),
    }));
    const body = await response.json() as { code?: string; fieldErrors?: Record<string, string[]> };

    expect(response.status).toBe(409);
    expect(body.code).toBe('DUPLICATE_EMAIL');
    expect(body.fieldErrors?.email?.[0]).toContain('already exists');
  });

  it('rejects wrong PIN without disclosing the expected PIN or hash', async () => {
    mockState.verifyOrBootstrapAddAdminPin.mockResolvedValueOnce({ ok: false, bootstrapped: false });
    const { POST } = await import('../../app/api/mobile/admin/add-admin/unlock/route');

    const response = await POST(new Request('http://test.local/api/mobile/admin/add-admin/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '0000' }),
    }));
    const bodyText = await response.text();

    expect(response.status).toBe(403);
    expect(bodyText).toContain('Security PIN is incorrect.');
    expect(bodyText).not.toContain('0000');
    expect(bodyText).not.toContain('hash');
    expect(mockState.issueAddAdminUnlock).not.toHaveBeenCalled();
  });

  it('temporarily unlocks Add Admin for the authenticated owner only', async () => {
    const { POST } = await import('../../app/api/mobile/admin/add-admin/unlock/route');

    const response = await POST(new Request('http://test.local/api/mobile/admin/add-admin/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '1111' }),
    }));
    const body = await response.json() as { unlockToken?: string; expiresAt?: string };

    expect(response.status).toBe(200);
    expect(body.unlockToken).toBe('unlock-token-that-is-long-enough-for-tests');
    expect(body.expiresAt).toBe('2026-07-20T12:05:00.000Z');
    expect(body.unlockToken).not.toContain('1111');
    expect(mockState.resetAddAdminPinFailures).toHaveBeenCalledWith('attempt-key');
  });

  it('rate limits repeated PIN failures', async () => {
    mockState.getAddAdminPinCooldownMs.mockReturnValueOnce(45_000);
    const { POST } = await import('../../app/api/mobile/admin/add-admin/unlock/route');

    const response = await POST(new Request('http://test.local/api/mobile/admin/add-admin/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '1111' }),
    }));
    const body = await response.json() as { code?: string; retryAfterSeconds?: number };

    expect(response.status).toBe(429);
    expect(body.code).toBe('PIN_COOLDOWN');
    expect(body.retryAfterSeconds).toBe(45);
    expect(mockState.verifyOrBootstrapAddAdminPin).not.toHaveBeenCalled();
  });
});
