import { NextRequest, NextResponse } from 'next/server';
import { authMobile } from '@/lib/auth';
import { put } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_AUDIO_SIZE = 12 * 1024 * 1024; // 12MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
const ALLOWED_AUDIO_TYPES = [
  'audio/aac',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
  'audio/3gpp',
];

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'audio/aac': 'aac',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/x-m4a': 'm4a',
  'audio/3gpp': '3gp',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  aac: 'audio/aac',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  ogg: 'audio/ogg',
  png: 'image/png',
  wav: 'audio/wav',
  webm: 'audio/webm',
  webp: 'image/webp',
  '3gp': 'audio/3gpp',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function normalizeMimeType(type: string): string {
  return type.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';
}

function mimeTypeFromFilename(name: string | undefined): string | null {
  const extension = name?.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase();
  return extension ? MIME_BY_EXTENSION[extension] ?? null : null;
}

export function resolveChatUploadMimeType(file: Pick<File, 'type' | 'name'>): string {
  const normalized = normalizeMimeType(file.type);
  if (normalized !== 'application/octet-stream') return normalized;
  return mimeTypeFromFilename(file.name) ?? normalized;
}

function canUseLocalUploadFallback(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function isChatBlobStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function getRequestOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host;
  const protocol = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '') ?? 'http';
  return `${protocol}://${host}`;
}

async function saveLocalUpload(file: File, filename: string, request: NextRequest) {
  const publicRelativePath = filename.replace(/^chat-attachments\//, 'uploads/chat-attachments/');
  const destination = path.join(process.cwd(), 'public', ...publicRelativePath.split('/'));
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await file.arrayBuffer()));

  const basename = path.basename(filename);
  return {
    url: new URL(`/api/chat/uploads/${basename}`, getRequestOrigin(request)).toString(),
    pathname: publicRelativePath,
  };
}

function json(data: Record<string, unknown>, init: ResponseInit = {}) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...init.headers,
    },
  });
}

function storageUnavailableResponse(reason: string) {
  return json(
    {
      error: 'Chat media upload storage is not available. Please check server media storage configuration.',
      code: 'CHAT_UPLOAD_STORAGE_UNAVAILABLE',
      reason,
    },
    { status: 503 },
  );
}

function isMissingBlobTokenError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('BLOB_READ_WRITE_TOKEN');
}

/** POST /api/chat/upload — upload a chat image or voice-note attachment to Vercel Blob */
export async function POST(request: NextRequest) {
  try {
    const session = await authMobile(request);
    if (!session) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData() as any;
    const file = formData.get('file') as File | null;

    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    const mimeType = resolveChatUploadMimeType(file);
    const isImage = ALLOWED_IMAGE_TYPES.includes(mimeType);
    const isAudio = ALLOWED_AUDIO_TYPES.includes(mimeType);

    if (!isImage && !isAudio) {
      return json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF, HEIC, M4A, MP3, WAV, OGG, or WebM.' },
        { status: 400 },
      );
    }

    const maxFileSize = isAudio ? MAX_AUDIO_SIZE : MAX_IMAGE_SIZE;
    if (file.size > maxFileSize) {
      return json(
        { error: `File too large. Maximum size is ${isAudio ? '12MB' : '5MB'}.` },
        { status: 400 },
      );
    }

    const extension = EXTENSION_BY_MIME[mimeType] ?? 'bin';
    const filename = `chat-attachments/${uuidv4()}.${extension}`;

    let upload: { url: string; pathname?: string };
    if (canUseLocalUploadFallback() && !isChatBlobStorageConfigured()) {
      console.warn('[chat-upload] BLOB_READ_WRITE_TOKEN missing; using local dev upload fallback.');
      upload = await saveLocalUpload(file, filename, request);
    } else if (!isChatBlobStorageConfigured()) {
      console.error('[chat-upload] BLOB_READ_WRITE_TOKEN is missing in production.');
      return storageUnavailableResponse('missing_blob_token');
    } else {
      try {
        upload = await put(filename, file, {
          access: 'public',
          addRandomSuffix: false,
          contentType: mimeType,
        });
      } catch (error) {
        if (canUseLocalUploadFallback()) {
          console.warn('[chat-upload] Vercel Blob upload failed; using local dev upload fallback.', error);
          upload = await saveLocalUpload(file, filename, request);
        } else if (!isChatBlobStorageConfigured() || isMissingBlobTokenError(error)) {
          console.error('[chat-upload] Vercel Blob token is missing in production.');
          return storageUnavailableResponse('missing_blob_token');
        } else {
          console.error('[chat-upload] Vercel Blob upload failed:', error);
          return storageUnavailableResponse('blob_upload_failed');
        }
      }
    }

    return json({
      url: upload.url,
      mimeType,
      fileSize: file.size,
      fileName: file.name,
    });
  } catch (error) {
    console.error('[chat-upload] Upload failed:', error);
    return json(
      { error: 'Failed to upload chat attachment. Please try again.' },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
