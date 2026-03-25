import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { driverSoundAssets } from '@/lib/db/schema';
import { put } from '@vercel/blob';

const ALLOWED_MIME_TYPES = ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/ogg', 'audio/mp3'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const displayName = formData.get('displayName') as string | null;

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Allowed: WAV, MP3, OGG.` },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is 2 MB.` },
      { status: 400 },
    );
  }

  // Sanitize filename: keep only safe chars
  const safeName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 80);

  const label = displayName?.trim() || safeName.replace(/\.[^.]+$/, '');

  // Upload to Vercel Blob storage
  const blob = await put(`driver-sounds/${safeName}`, file, {
    access: 'public',
    contentType: file.type,
  });

  // Persist metadata
  const [asset] = await db
    .insert(driverSoundAssets)
    .values({
      fileName: safeName,
      displayName: label,
      fileUrl: blob.url,
      mimeType: file.type,
      fileSize: file.size,
      uploadedBy: session.user.id,
    })
    .returning();

  return NextResponse.json({ asset });
}
