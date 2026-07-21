import { Platform } from 'react-native';
import { API_BASE_URL, ApiError, getAdminToken } from './api';

export interface ChatAttachmentUpload {
  url: string;
  mimeType: string;
  fileSize: number;
  fileName?: string;
}

export interface ChatLocalAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  file?: File;
}

export const CHAT_VOICE_MIME_TYPE = Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4';

const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function makeVoiceFileName(): string {
  const extension = Platform.OS === 'web' ? 'webm' : 'm4a';
  return `voice-${Date.now()}.${extension}`;
}

function normalizeImageMimeType(asset: ChatLocalAsset): string {
  const mimeType = asset.mimeType?.split(';')[0]?.trim().toLowerCase();
  if (mimeType && IMAGE_EXTENSION_BY_MIME[mimeType]) return mimeType;

  const name = asset.fileName ?? asset.file?.name ?? asset.uri;
  const extension = name.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function makeImageFileName(asset: ChatLocalAsset, mimeType: string): string {
  const extension = IMAGE_EXTENSION_BY_MIME[mimeType] ?? 'jpg';
  const existing = asset.fileName ?? asset.file?.name;
  if (existing && /\.[a-z0-9]+$/i.test(existing)) return existing;
  return `photo-${Date.now()}.${extension}`;
}

export function resolveChatAudioUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    const staticPrefix = '/uploads/chat-attachments/';
    const apiPrefix = '/api/chat/uploads/';
    if (parsed.pathname.startsWith(staticPrefix)) {
      const filename = parsed.pathname.slice(staticPrefix.length);
      return `${API_BASE_URL}${apiPrefix}${encodeURIComponent(filename)}`;
    }
    if (parsed.pathname.startsWith(apiPrefix) && ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)) {
      return `${API_BASE_URL}${parsed.pathname}`;
    }
  } catch {
    // Remote blob URLs and unexpected values can still be passed through.
  }
  return uri;
}

async function appendFile(
  formData: FormData,
  uri: string,
  fileName: string,
  mimeType: string,
  webFile?: File,
): Promise<void> {
  if (Platform.OS === 'web') {
    if (webFile) {
      formData.append('file', webFile, fileName);
      return;
    }
    const response = await fetch(uri);
    const sourceBlob = await response.blob();
    const blob = sourceBlob.type ? sourceBlob : new Blob([await sourceBlob.arrayBuffer()], { type: mimeType });
    formData.append('file', blob, fileName);
    return;
  }

  formData.append('file', { uri, name: fileName, type: mimeType } as unknown as Blob);
}

async function uploadChatAttachment(
  uri: string,
  fileName: string,
  mimeType: string,
  webFile?: File,
): Promise<ChatAttachmentUpload> {
  const formData = new FormData();
  await appendFile(formData, uri, fileName, mimeType, webFile);

  const token = getAdminToken();
  const res = await fetch(`${API_BASE_URL}/api/chat/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  const contentType = res.headers.get('content-type') || '';
  const payload: unknown = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    if (payload && typeof payload === 'object') {
      const data = payload as Record<string, unknown>;
      if (typeof data.error === 'string' && data.error.trim()) message = data.error;
      else if (typeof data.message === 'string' && data.message.trim()) message = data.message;
    }
    throw new ApiError(message, res.status, payload);
  }

  return payload as ChatAttachmentUpload;
}

export async function uploadChatVoiceAttachment(uri: string): Promise<ChatAttachmentUpload> {
  return uploadChatAttachment(uri, makeVoiceFileName(), CHAT_VOICE_MIME_TYPE);
}

export async function uploadChatImageAttachment(asset: ChatLocalAsset): Promise<ChatAttachmentUpload> {
  const mimeType = normalizeImageMimeType(asset);
  return uploadChatAttachment(asset.uri, makeImageFileName(asset, mimeType), mimeType, asset.file);
}
