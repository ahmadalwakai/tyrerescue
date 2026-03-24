'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Flex, Text, Spinner, HStack } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import type { MessageView, ChatChannel, ChatRole, ConversationDetail } from '@/lib/chat/types';

interface Props {
  bookingId: string;
  bookingRef: string;
  channel: ChatChannel;
  currentUserId: string;
  currentUserRole: ChatRole;
  /** If true, show admin-only controls (lock, mute, close, notes) */
  showAdminControls?: boolean;
  /** Start collapsed? */
  defaultCollapsed?: boolean;
}

export function ChatWidget({
  bookingId,
  bookingRef,
  channel,
  currentUserId,
  currentUserRole,
  showAdminControls = false,
  defaultCollapsed = true,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [unread, setUnread] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── Initialize / get conversation ──────────────────── */
  const initConversation = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, channel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to open chat');
        return;
      }
      setConversationId(data.conversationId);
    } catch {
      setError('Network error');
    }
  }, [bookingId, channel]);

  useEffect(() => {
    if (!collapsed && !conversationId) {
      initConversation();
    }
  }, [collapsed, conversationId, initConversation]);

  /* ─── Load messages ──────────────────────────────────── */
  const fetchMessages = useCallback(async (cId: string, cursor?: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      params.set('limit', '50');
      const res = await fetch(`/api/chat/conversations/${cId}/messages?${params}`);
      const data = await res.json();
      if (res.ok) {
        if (cursor) {
          // Prepend older messages
          setMessages((prev) => [...data.messages, ...prev]);
        } else {
          setMessages(data.messages);
        }
        setNextCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
      }
    } catch { /* silent */ }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (conversationId && !collapsed) {
      fetchMessages(conversationId);
      // Mark as read
      fetch(`/api/chat/conversations/${conversationId}/read`, { method: 'POST' });
      setUnread(0);
    }
  }, [conversationId, collapsed, fetchMessages]);

  /* ─── Load conversation detail ───────────────────────── */
  useEffect(() => {
    if (!conversationId || collapsed) return;
    fetch(`/api/chat/conversations/${conversationId}`)
      .then((r) => r.json())
      .then((d) => { if (d.id) setDetail(d); });
  }, [conversationId, collapsed]);

  /* ─── Poll for new messages (every 5s) ───────────────── */
  useEffect(() => {
    if (collapsed || !conversationId) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/chat/conversations/${conversationId}/messages?limit=50`);
        const data = await res.json();
        if (res.ok && data.messages) {
          setMessages(data.messages);
          // Mark as read since we're viewing
          fetch(`/api/chat/conversations/${conversationId}/read`, { method: 'POST' });
        }
      } catch { /* silent */ }
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [collapsed, conversationId]);

  /* ─── Poll unread count when collapsed ───────────────── */
  useEffect(() => {
    if (!collapsed || !conversationId) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch('/api/chat/unread');
        const data = await res.json();
        if (res.ok) setUnread(data.unread);
      } catch { /* silent */ }
    }, 15000);
    return () => clearInterval(poll);
  }, [collapsed, conversationId]);

  /* ─── Send text message ──────────────────────────────── */
  const handleSend = useCallback(async (text: string) => {
    if (!conversationId) return;
    setIsSending(true);
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, messageType: 'text' }),
      });
      const msg = await res.json();
      if (res.ok) {
        setMessages((prev) => [...prev, msg]);
      }
    } catch { /* silent */ }
    setIsSending(false);
  }, [conversationId]);

  /* ─── Send admin note ────────────────────────────────── */
  const handleSendNote = useCallback(async (text: string) => {
    if (!conversationId) return;
    setIsSending(true);
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, messageType: 'admin_note' }),
      });
      const msg = await res.json();
      if (res.ok) setMessages((prev) => [...prev, msg]);
    } catch { /* silent */ }
    setIsSending(false);
  }, [conversationId]);

  /* ─── Send image ─────────────────────────────────────── */
  const handleSendImage = useCallback(async (file: File) => {
    if (!conversationId) return;
    setIsSending(true);
    try {
      // Upload
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/chat/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        setError(uploadData.error ?? 'Upload failed');
        setIsSending(false);
        return;
      }
      // Send message
      const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: null,
          messageType: 'image',
          attachment: {
            url: uploadData.url,
            mimeType: uploadData.mimeType,
            fileSize: uploadData.fileSize,
            fileName: uploadData.fileName,
          },
        }),
      });
      const msg = await res.json();
      if (res.ok) setMessages((prev) => [...prev, msg]);
    } catch { /* silent */ }
    setIsSending(false);
  }, [conversationId]);

  /* ─── Admin controls ─────────────────────────────────── */
  const handleAdminAction = useCallback(async (action: Record<string, unknown>) => {
    if (!conversationId) return;
    await fetch(`/api/chat/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    });
    // Refresh detail
    const res = await fetch(`/api/chat/conversations/${conversationId}`);
    const data = await res.json();
    if (data.id) setDetail(data);
  }, [conversationId]);

  /* ─── Channel label ──────────────────────────────────── */
  const channelLabel =
    channel === 'customer_admin' ? 'Customer ↔ Admin'
    : channel === 'admin_driver' ? 'Admin ↔ Driver'
    : 'Customer ↔ Driver';

  const isLocked = detail?.locked ?? false;
  const isClosed = detail?.status === 'closed' || detail?.status === 'archived';
  const inputDisabled = isLocked || isClosed;

  /* ─── Render ─────────────────────────────────────────── */
  return (
    <Box
      borderWidth="1px"
      borderColor={c.border}
      borderRadius="8px"
      overflow="hidden"
      bg={c.bg}
      style={anim.fadeUp('0.3s')}
    >
      {/* Header — always visible */}
      <Flex
        align="center"
        justify="space-between"
        px={3}
        py={2}
        bg={c.surface}
        cursor="pointer"
        onClick={() => setCollapsed(!collapsed)}
        _hover={{ bg: c.card }}
        transition="background 0.15s"
      >
        <HStack gap={2}>
          <Text fontSize="13px" fontWeight="600" color={c.text}>
            💬 Chat
          </Text>
          <Text fontSize="11px" color={c.muted}>
            {channelLabel}
          </Text>
          {detail?.locked && (
            <Text fontSize="11px" color="#EF4444">🔒</Text>
          )}
        </HStack>
        <HStack gap={2}>
          {unread > 0 && collapsed && (
            <Box
              bg={c.accent}
              color="white"
              borderRadius="full"
              px={2}
              py={0}
              fontSize="11px"
              fontWeight="700"
              minW="20px"
              textAlign="center"
            >
              {unread}
            </Box>
          )}
          <Text fontSize="12px" color={c.muted}>
            {collapsed ? '▼' : '▲'}
          </Text>
        </HStack>
      </Flex>

      {/* Chat body */}
      {!collapsed && (
        <Box display="flex" flexDirection="column" h="400px">
          {error && (
            <Box p={2} bg="rgba(239,68,68,0.1)" borderBottomWidth="1px" borderColor="rgba(239,68,68,0.3)">
              <Text fontSize="12px" color="#EF4444">{error}</Text>
            </Box>
          )}

          {/* Status bar */}
          {isClosed && (
            <Box p={2} bg="rgba(245,158,11,0.1)" borderBottomWidth="1px" borderColor="rgba(245,158,11,0.25)">
              <Text fontSize="12px" color="#F59E0B" textAlign="center">
                This conversation is {detail?.status}.
                {showAdminControls && (
                  <Box as="span"
                    ml={2} cursor="pointer" textDecoration="underline"
                    onClick={() => handleAdminAction({ reopen: true })}
                  >
                    Reopen
                  </Box>
                )}
              </Text>
            </Box>
          )}

          <MessageList
            messages={messages}
            currentUserId={currentUserId}
            isLoading={isLoading}
            hasMore={hasMore}
            onLoadMore={() => { if (nextCursor && conversationId) fetchMessages(conversationId, nextCursor); }}
          />

          {/* Admin controls bar */}
          {showAdminControls && detail && !isClosed && (
            <Flex gap={2} px={3} py={1} bg={c.surface} borderTopWidth="1px" borderColor={c.border} wrap="wrap">
              <AdminBtn
                label={detail.locked ? 'Unlock' : 'Lock'}
                onClick={() => handleAdminAction({ lock: !detail.locked })}
              />
              <AdminBtn
                label={detail.muted ? 'Unmute' : 'Mute'}
                onClick={() => handleAdminAction({ mute: !detail.muted })}
              />
              <AdminBtn label="Close" onClick={() => handleAdminAction({ close: true })} />
              <AdminBtn label="Archive" onClick={() => handleAdminAction({ archive: true })} />
            </Flex>
          )}

          {/* Send admin note */}
          {showAdminControls && !isClosed && (
            <NoteInput onSend={handleSendNote} disabled={isSending} />
          )}

          {/* Message input */}
          <MessageInput
            onSend={handleSend}
            onSendImage={handleSendImage}
            disabled={inputDisabled}
            isSending={isSending}
            placeholder={inputDisabled ? 'Conversation is locked' : undefined}
          />
        </Box>
      )}
    </Box>
  );
}

/* ─── Small helpers ────────────────────────────────────── */

function AdminBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: `1px solid ${c.border}`,
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 11,
        color: c.muted,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function NoteInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <Flex px={3} py={1} gap={2} borderTopWidth="1px" borderColor={c.border} bg="rgba(249,115,22,0.04)">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="Add internal note…"
        disabled={disabled}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: c.accent,
          fontSize: 12,
          fontStyle: 'italic',
        }}
      />
      <button
        onClick={submit}
        disabled={disabled || !text.trim()}
        style={{
          background: 'transparent',
          border: 'none',
          color: c.accent,
          fontSize: 11,
          fontWeight: 600,
          cursor: text.trim() ? 'pointer' : 'default',
          opacity: text.trim() ? 1 : 0.4,
        }}
      >
        + Note
      </button>
    </Flex>
  );
}
