import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  authMobile: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
}));

vi.mock('uuid', () => ({
  v4: () => '11111111-1111-4111-8111-111111111111',
}));

const { authMobile } = await import('@/lib/auth');
const { put } = await import('@vercel/blob');
const { POST, resolveChatUploadMimeType } = await import('../../app/api/chat/upload/route');

const authMobileMock = vi.mocked(authMobile);
const putMock = vi.mocked(put);

function makeRequest(file: File): NextRequest {
  const formData = new FormData();
  formData.append('file', file);
  return new Request('https://example.test/api/chat/upload', {
    method: 'POST',
    body: formData,
  }) as unknown as NextRequest;
}

describe('chat upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMobileMock.mockResolvedValue({
      user: {
        id: 'admin-1',
        email: 'admin@example.test',
        name: 'Admin',
        role: 'admin',
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('infers iOS voice note MIME type from filename when native upload reports octet stream', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'voice-123.m4a', {
      type: 'application/octet-stream',
    });

    expect(resolveChatUploadMimeType(file)).toBe('audio/mp4');
  });

  it('returns a storage configuration error instead of a generic 500 when Blob is missing in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');

    const response = await POST(makeRequest(new File(['voice'], 'voice.m4a', { type: 'audio/mp4' })));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      code: 'CHAT_UPLOAD_STORAGE_UNAVAILABLE',
      reason: 'missing_blob_token',
    });
    expect(putMock).not.toHaveBeenCalled();
  });

  it('uploads with normalized content type when Blob storage is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_test');
    putMock.mockResolvedValue({
      url: 'https://blob.example/chat-attachments/11111111-1111-4111-8111-111111111111.m4a',
      downloadUrl: 'https://blob.example/chat-attachments/11111111-1111-4111-8111-111111111111.m4a?download=1',
      pathname: 'chat-attachments/11111111-1111-4111-8111-111111111111.m4a',
      contentType: 'audio/mp4',
      contentDisposition: 'inline',
      etag: 'test-etag',
    });

    const response = await POST(
      makeRequest(new File([new Uint8Array([1, 2, 3])], 'voice.m4a', { type: 'application/octet-stream' })),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      url: 'https://blob.example/chat-attachments/11111111-1111-4111-8111-111111111111.m4a',
      mimeType: 'audio/mp4',
      fileName: 'voice.m4a',
    });
    expect(putMock).toHaveBeenCalledWith(
      'chat-attachments/11111111-1111-4111-8111-111111111111.m4a',
      expect.any(File),
      expect.objectContaining({ contentType: 'audio/mp4' }),
    );
  });
});
