import type { ChatAttachmentUpload } from './chat-attachments';

export function mergeChatMessages<T extends { id: string; createdAt: string }>(previous: T[], incoming: T[]): T[] {
  const messages = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

/** Retry identifiers are not access credentials. Compatible with native Hermes and web. */
export function newChatMessageId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

export interface PendingChatSend {
  key: string;
  clientMessageId: string;
  attachment?: ChatAttachmentUpload;
}

export function pendingChatSend(previous: PendingChatSend | null, key: string): PendingChatSend {
  return previous?.key === key ? previous : { key, clientMessageId: newChatMessageId() };
}
