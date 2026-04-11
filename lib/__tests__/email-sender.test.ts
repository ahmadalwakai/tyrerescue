import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocked send functions we'll control per-test
const zeptoSend = vi.fn();

// Mock the config module before importing sender
vi.mock('../email/config', () => ({
  emailConfig: {
    zeptomail: {
      apiKey: 'test-zepto-key',
      fromEmail: 'noreply@tyrerescue.uk',
      apiUrl: 'https://api.zeptomail.eu/v1.1/email',
    },
  },
  hasZeptoMail: true,
  getPrimaryProvider: () => 'zeptomail' as const,
}));

// Mock the providers with proper class constructors
vi.mock('../email/providers/zeptomail', () => ({
  ZeptoMailProvider: class {
    send = zeptoSend;
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
  });

  it('returns failure when ZeptoMail fails', async () => {
    zeptoSend.mockResolvedValue({
      success: false,
      provider: 'zeptomail',
      error: 'ZeptoMail error 502',
      statusCode: 502,
      retriable: true,
    });

    const result = await sendWithFallback(baseEmail);

    expect(result.success).toBe(false);
    expect(result.provider).toBe('zeptomail');
    expect(result.attemptedProviders).toEqual(['zeptomail']);
    expect(result.error).toBe('ZeptoMail error 502');
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
