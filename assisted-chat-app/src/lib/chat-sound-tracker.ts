export interface ChatSoundMessage {
  id: string;
  senderId: string;
  senderRole: string;
  messageType: string;
  createdAt: string;
  deleted?: boolean;
}

/** Polling/history must never replay a tone for an already-seen message. */
export function createChatSoundTracker(currentUserId?: string | null) {
  let initialised = false;
  let newestTimestamp = Number.NEGATIVE_INFINITY;
  const seen = new Set<string>();
  const sent = new Set<string>();

  return {
    observe(messages: readonly ChatSoundMessage[]): boolean {
      let incoming = false;
      const previousNewest = newestTimestamp;
      for (const message of messages) {
        const timestamp = Date.parse(message.createdAt);
        const known = seen.has(message.id);
        seen.add(message.id);
        if (Number.isFinite(timestamp)) newestTimestamp = Math.max(newestTimestamp, timestamp);
        if (initialised && !known && Number.isFinite(timestamp) && timestamp >= previousNewest
          && !message.deleted && message.messageType !== 'admin_note'
          && (message.senderRole === 'driver' || message.senderRole === 'customer')
          && message.senderId !== currentUserId) incoming = true;
      }
      initialised = true;
      // A busy chat is bounded in memory. The timestamp watermark still
      // suppresses old history after its IDs leave this window.
      while (seen.size > 2_000) seen.delete(seen.values().next().value!);
      return incoming;
    },
    confirmSent(messageId?: string): boolean {
      if (messageId && sent.has(messageId)) return false;
      if (messageId) sent.add(messageId);
      while (sent.size > 500) sent.delete(sent.values().next().value!);
      return true;
    },
    reset() {
      initialised = false;
      newestTimestamp = Number.NEGATIVE_INFINITY;
      seen.clear();
      sent.clear();
    },
  };
}
