import { Linking, Platform } from 'react-native';
import { getAdminToken } from './api';
import { resolveChatAudioUri } from './chat-attachments';

interface SaveChatAttachmentInput {
  url: string;
  mimeType: string;
  fileName?: string | null;
}

function extensionForMime(mimeType: string): string {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'audio/webm') return 'webm';
  if (normalized === 'audio/wav') return 'wav';
  if (normalized === 'audio/mpeg' || normalized === 'audio/mp3') return 'mp3';
  if (normalized === 'audio/aac') return 'aac';
  return normalized?.startsWith('audio/') ? 'm4a' : 'bin';
}

function safeFileName(fileName: string | null | undefined, mimeType: string): string {
  const fallback = `chat-attachment-${Date.now()}.${extensionForMime(mimeType)}`;
  const cleaned = (fileName || fallback)
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

function authHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function saveOnWeb(url: string, filename: string): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Saving attachments is unavailable in this environment.');
  }

  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) throw new Error(`Attachment download failed (${response.status}).`);
  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
}

async function saveOnNative(url: string, filename: string, mimeType: string): Promise<void> {
  const [{ File, Paths }, Sharing] = await Promise.all([
    import('expo-file-system'),
    import('expo-sharing'),
  ]);

  const destination = new File(Paths.document, filename);
  const file = await File.downloadFileAsync(url, destination, {
    headers: authHeaders(),
    idempotent: true,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType,
      dialogTitle: `Save ${filename}`,
    });
    return;
  }

  await Linking.openURL(file.uri);
}

export async function saveChatAttachmentToDevice(input: SaveChatAttachmentInput): Promise<void> {
  const url = resolveChatAudioUri(input.url);
  const filename = safeFileName(input.fileName, input.mimeType);

  if (Platform.OS === 'web') {
    await saveOnWeb(url, filename);
    return;
  }

  await saveOnNative(url, filename, input.mimeType);
}
