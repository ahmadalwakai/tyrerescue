import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocked send functions we'll control per-test
const zeptoSend = vi.fn();
const resendSend = vi.fn();

// Mock the config module before importing sender
vi.mock('../email/config', () => ({
  emailConfig: {
    zeptomail: {
      apiKey: 'test-zepto-key',
      fromEmail: 'noreply@tyrerescue.uk',
      apiUrl: 'https://api.zeptomail.eu/v1.1/email',
    },
    resend: {
      apiKey: 'test-resend-key',
      fromEmail: 'support@tyrerescue.uk',
    },
  },
  hasZeptoMail: true,
  hasResend: true,
  getPrimaryProvider: () => 'zeptomail' as const,
}));

// Mock the providers with proper class constructors
vi.mock('../email/providers/zeptomail', () => ({
  ZeptoMailProvider: class {
    send = zeptoSend;
  },
}));

vi.mock('../email/providers/resend', () => ({
  ResendProvider: class {
    send = resendSend;
  },
}));

import { sendWithFallback, _resetProviders } from '../email/sender';

const baseEmail = {
  to: 'test@example.com',
  subject: 'Test Subject',
  html: '<p>Hello</p>',
};

describe('sendWithFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetProviders();
  });

  it('sends via ZeptoMail when it succeeds', async () => {
    zeptoSend.mockResolvedValue({
      success: true,
      provider: 'zeptomail',
      messageId: 'zepto-123',
    });

    const result = await sendWithFallback(baseEmail);

    expect(result.success).toBe(true);
    expect(result.provider).toBe('zeptomail');
    expect(result.attemptedProviders).toContain('zeptomail');
    expect(result.fallbackUsed).toBe(false);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it('falls back to Resend after ZeptoMail 5xx', async () => {
    zeptoSend.mockResolvedValue({
      success: false,
      provider: 'zeptomail',
      error: 'ZeptoMail error 502',
      statusCode: 502,
      retriable: true,
    });
    resendSend.mockResolvedValue({
      success: true,
      provider: 'resend',
      messageId: 'resend-456',
    });

    const result = await sendWithFallback(baseEmail);

    expect(result.success).toBe(true);
    expect(result.provider).toBe('resend');
    expect(result.attemptedProviders).toEqual(['zeptomail', 'resend']);
    expect(result.fallbackUsed).toBe(true);
  });

  it('does NOT fall back on ambiguous timeout (retriable=false)', async () => {
    zeptoSend.mockResolvedValue({
      success: false,
      provider: 'zeptomail',
      error: 'ZeptoMail request timed out',
      retriable: false,
    });

    const result = await sendWithFallback(baseEmail);

    expect(result.success).toBe(false);
    expect(result.provider).toBe('zeptomail');
    expect(result.error).toBe('ZeptoMail request timed out');
    expect(result.attemptedProviders).toEqual(['zeptomail']);
    expect(result.fallbackUsed).toBe(false);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it('returns failure when all providers fail', async () => {
    zeptoSend.mockResolvedValue({
      success: false,
      provider: 'zeptomail',
      error: 'ZeptoMail down',
      retriable: true,
    });
    resendSend.mockResolvedValue({
      success: false,
      provider: 'resend',
      error: 'Resend down',
      retriable: true,
    });

    const result = await sendWithFallback(baseEmail);

    expect(result.success).toBe(false);
    expect(result.attemptedProviders).toEqual(['zeptomail', 'resend']);
    expect(result.fallbackUsed).toBe(true);
    expect(result.error).toBe('All email providers failed');
  });

  it('includes messageId from successful provider', async () => {
    zeptoSend.mockResolvedValue({
      success: true,
      provider: 'zeptomail',
      messageId: 'msg-abc',
    });

    const result = await sendWithFallback(baseEmail);

    expect(result.messageId).toBe('msg-abc');
  });
});
