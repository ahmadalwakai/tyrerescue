import { NextRequest, NextResponse } from 'next/server';
import { authMobile } from '@/lib/auth';
import { put } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_AUDIO_SIZE = 12 * 1024 * 1024; // 12MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
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

function normalizeMimeType(type: string): string {
  return type.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';
}

function canUseLocalUploadFallback(): boolean {
  return process.env.NODE_ENV !== 'production';
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

/** POST /api/chat/upload — upload a chat image or voice-note attachment to Vercel Blob */
export async function POST(request: NextRequest) {
  try {
    const session = await authMobile(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData() as any;
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const mimeType = normalizeMimeType(file.type);
    const isImage = ALLOWED_IMAGE_TYPES.includes(mimeType);
    const isAudio = ALLOWED_AUDIO_TYPES.includes(mimeType);

    if (!isImage && !isAudio) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF, M4A, MP3, WAV, OGG, or WebM.' },
        { status: 400 },
      );
    }

    const maxFileSize = isAudio ? MAX_AUDIO_SIZE : MAX_IMAGE_SIZE;
    if (file.size > maxFileSize) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${isAudio ? '12MB' : '5MB'}.` },
        { status: 400 },
      );
    }

    const extension = EXTENSION_BY_MIME[mimeType] ?? 'bin';
    const filename = `chat-attachments/${uuidv4()}.${extension}`;

    let upload: { url: string; pathname?: string };
    try {
      upload = await put(filename, file, {
        access: 'public',
        addRandomSuffix: false,
        contentType: mimeType,
      });
    } catch (error) {
      if (!canUseLocalUploadFallback()) throw error;
      console.warn('[chat-upload] Vercel Blob upload failed; using local dev upload fallback.', error);
      upload = await saveLocalUpload(file, filename, request);
    }

    return NextResponse.json({
      url: upload.url,
      mimeType,
      fileSize: file.size,
      fileName: file.name,
    });
  } catch (error) {
    console.error('[chat-upload] Upload failed:', error);
    return NextResponse.json(
      { error: 'Failed to upload chat attachment. Please try again.' },
      { status: 500 },
    );
  }
}
