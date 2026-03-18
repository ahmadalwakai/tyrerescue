import { NextRequest, NextResponse } from 'next/server';
import { authMobile } from '@/lib/auth';
import { put } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** POST /api/chat/upload — upload a chat image attachment to Vercel Blob */
export async function POST(request: NextRequest) {
  const session = await authMobile(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF.' },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File too large. Maximum size is 5MB.' },
      { status: 400 },
    );
  }

  const extension = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  const filename = `chat-attachments/${uuidv4()}.${extension}`;

  const blob = await put(filename, file, {
    access: 'public',
    addRandomSuffix: false,
  });

  return NextResponse.json({
    url: blob.url,
    mimeType: file.type,
    fileSize: file.size,
    fileName: file.name,
  });
}
