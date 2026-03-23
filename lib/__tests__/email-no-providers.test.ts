import { describe, it, expect, vi } from 'vitest';

// Mock config with NO providers configured
vi.mock('../email/config', () => ({
  emailConfig: {
    zeptomail: { apiKey: '', fromEmail: '', apiUrl: '' },
    resend: { apiKey: '', fromEmail: '' },
  },
  hasZeptoMail: false,
  hasResend: false,
  getPrimaryProvider: () => null,
}));

vi.mock('../email/providers/zeptomail', () => ({
  ZeptoMailProvider: class {
    send = vi.fn();
  },
}));

vi.mock('../email/providers/resend', () => ({
  ResendProvider: class {
    send = vi.fn();
  },
}));

import { sendWithFallback } from '../email/sender';

describe('sendWithFallback — no providers', () => {
  it('returns failure when no email provider is configured', async () => {
    const result = await sendWithFallback({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('No email provider configured');
    expect(result.attemptedProviders).toEqual([]);
    expect(result.fallbackUsed).toBe(false);
  });
});
