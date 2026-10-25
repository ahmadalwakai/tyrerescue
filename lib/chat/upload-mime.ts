/**
 * MIME type resolution for chat attachments.
 *
 * Lives outside app/api/chat/upload/route.ts because a Next.js route file
 * may only export route handlers and route config.
 */

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
