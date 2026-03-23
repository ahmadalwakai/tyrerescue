import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub fetch globally for ZeptoMail
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock config for ZeptoMail only tests
vi.mock('../email/config', () => ({
  emailConfig: {
    zeptomail: {
      apiKey: 'test-zepto-key',
      fromEmail: 'noreply@tyrerescue.uk',
      apiUrl: 'https://api.zeptomail.eu/v1.1/email',
    },
    resend: {
      apiKey: '',
      fromEmail: 'support@tyrerescue.uk',
    },
  },
  hasZeptoMail: true,
  hasResend: false,
  getPrimaryProvider: () => 'zeptomail' as const,
}));

import { ZeptoMailProvider } from '../email/providers/zeptomail';

const baseEmail = {
  to: 'test@example.com',
  subject: 'Test Subject',
  html: '<p>Hello</p>',
};

describe('ZeptoMailProvider', () => {
  let provider: InstanceType<typeof ZeptoMailProvider>;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new ZeptoMailProvider();
  });

  it('sends email successfully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ request_id: 'zepto-req-1', message: 'OK' }),
    });

    const result = await provider.send(baseEmail);

    expect(result.success).toBe(true);
    expect(result.provider).toBe('zeptomail');
    expect(result.messageId).toBe('zepto-req-1');
    expect(result.statusCode).toBe(200);

    // Verify fetch was called with correct params
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.zeptomail.eu/v1.1/email');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Zoho-enczapikey test-zepto-key');

    const body = JSON.parse(opts.body);
    expect(body.from.address).toBe('noreply@tyrerescue.uk');
    expect(body.to[0].email_address.address).toBe('test@example.com');
    expect(body.subject).toBe('Test Subject');
    expect(body.htmlbody).toBe('<p>Hello</p>');
  });

  it('treats 2xx with unparseable body as success (no duplicate)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON');
      },
    });

    const result = await provider.send(baseEmail);

    expect(result.success).toBe(true);
    expect(result.provider).toBe('zeptomail');
    expect(result.messageId).toBeUndefined();
  });

  it('handles 4xx errors as retriable', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Invalid from address' }),
    });

    const result = await provider.send(baseEmail);

    expect(result.success).toBe(false);
    expect(result.provider).toBe('zeptomail');
    expect(result.statusCode).toBe(400);
    expect(result.error).toBe('Invalid from address');
    expect(result.retriable).toBe(true);
  });

  it('handles 5xx errors as retriable', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ message: 'Bad Gateway' }),
    });

    const result = await provider.send(baseEmail);

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(502);
    expect(result.error).toBe('Bad Gateway');
    expect(result.retriable).toBe(true);
  });

  it('marks timeout (AbortError) as non-retriable to prevent duplicates', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    mockFetch.mockRejectedValue(abortError);

    const result = await provider.send(baseEmail);

    expect(result.success).toBe(false);
    expect(result.provider).toBe('zeptomail');
    expect(result.error).toBe('ZeptoMail request timed out');
    expect(result.retriable).toBe(false);
  });

  it('marks network errors as retriable', async () => {
    mockFetch.mockRejectedValue(new Error('Network unreachable'));

    const result = await provider.send(baseEmail);

    expect(result.success).toBe(false);
    expect(result.provider).toBe('zeptomail');
    expect(result.error).toBe('Network unreachable');
    expect(result.retriable).toBe(true);
  });

  it('sends to multiple recipients', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ request_id: 'zepto-req-2' }),
    });

    await provider.send({
      ...baseEmail,
      to: ['a@example.com', 'b@example.com'],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.to).toHaveLength(2);
    expect(body.to[0].email_address.address).toBe('a@example.com');
    expect(body.to[1].email_address.address).toBe('b@example.com');
  });

  it('includes attachments as base64', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ request_id: 'zepto-req-3' }),
    });

    await provider.send({
      ...baseEmail,
      attachments: [
        {
          filename: 'invoice.pdf',
          content: Buffer.from('pdf-content'),
          contentType: 'application/pdf',
        },
      ],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0].name).toBe('invoice.pdf');
    expect(body.attachments[0].mime_type).toBe('application/pdf');
    expect(body.attachments[0].content).toBe(
      Buffer.from('pdf-content').toString('base64')
    );
  });
});
