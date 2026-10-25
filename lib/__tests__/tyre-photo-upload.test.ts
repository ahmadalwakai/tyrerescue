import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { sniffImageType } from '@/lib/security/image-sniff';

const put = vi.fn(async (pathname: string) => ({ url: `https://blob.example/${pathname}`, pathname }));
vi.mock('@vercel/blob', () => ({ put }));
const checkRateLimit = vi.fn(async () => ({ ok: true, remaining: 9, retryAfterSeconds: 0 }));
vi.mock('@/lib/security', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security')>()),
  checkRateLimit,
}));

const { POST } = await import('@/app/api/upload/tyre-photo/route');

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const WEBP = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');

function upload(bytes: Uint8Array, type: string) {
  const form = new FormData();
  form.append('file', new File([bytes], 'tyre', { type }));
  return new Request('https://www.tyrerescue.uk/api/upload/tyre-photo', { method: 'POST', body: form }) as unknown as NextRequest;
}

beforeEach(() => {
  put.mockClear();
  checkRateLimit.mockClear();
});

describe('sniffImageType', () => {
  it('recognises JPEG, PNG and WebP signatures', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(WEBP)).toBe('image/webp');
    expect(sniffImageType(HTML)).toBeNull();
  });
});

describe('POST /api/upload/tyre-photo', () => {
  it('uploads a real image', async () => {
    const res = await POST(upload(JPEG, 'image/jpeg'));
    expect(res.status).toBe(200);
    expect(put).toHaveBeenCalledOnce();
  });

  it('rejects a non-image disguised with an image content type', async () => {
    const res = await POST(upload(HTML, 'image/png'));
    expect(res.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects an image whose bytes do not match the declared type', async () => {
    const res = await POST(upload(PNG, 'image/jpeg'));
    expect(res.status).toBe(400);
  });

  it('returns 429 once the per-IP limit is reached, without parsing the body', async () => {
    checkRateLimit.mockResolvedValueOnce({ ok: false, remaining: 0, retryAfterSeconds: 30 });
    const res = await POST(upload(JPEG, 'image/jpeg'));
    expect(res.status).toBe(429);
    expect(put).not.toHaveBeenCalled();
  });
});
