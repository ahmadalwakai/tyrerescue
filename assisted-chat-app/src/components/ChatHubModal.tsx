import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius, space } from './theme';

type ChatChannel = 'customer_admin' | 'customer_driver' | 'admin_driver';
type ChatRole = 'customer' | 'admin' | 'driver';
type ConversationStatus = 'open' | 'closed' | 'archived';
type MessageType = 'text' | 'image' | 'admin_note';
type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed';

interface ConversationSummary {
  id: string;
  bookingId: string;
  bookingRef: string;
  channel: ChatChannel;
  status: ConversationStatus;
  locked: boolean;
  muted: boolean;
  customerName: string;
  driverName: string | null;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  lastMessageSenderRole: ChatRole | null;
  unreadCount: number;
  createdAt: string;
}

interface ConversationDetail {
  id: string;
  bookingId: string;
  bookingRef: string;
  channel: ChatChannel;
  status: ConversationStatus;
  locked: boolean;
  muted: boolean;
}

interface MessageView {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: ChatRole;
  body: string | null;
  messageType: MessageType;
  deliveryStatus: DeliveryStatus;
  attachments: unknown[];
  createdAt: string;
}

interface ConversationsResponse {
  conversations: ConversationSummary[];
}

interface MessagesResponse {
  messages: MessageView[];
  nextCursor: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const CHANNEL_LABELS: Record<ChatChannel, string> = {
  customer_admin: 'Customer / Admin',
  customer_driver: 'Customer / Driver',
  admin_driver: 'Driver / Admin',
};

const CHANNEL_FILTERS: Array<{ value: 'all' | ChatChannel; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'admin_driver', label: 'Drivers' },
  { value: 'customer_admin', label: 'Customers' },
  { value: 'customer_driver', label: 'Customer/Driver' },
];

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return 'No messages';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.max(0, Math.round(diff / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function ChatHubModal({ visible, onClose }: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<ConversationSummary | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState<'all' | ChatChannel>('all');
  const [loadingList, setLoadingList] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const markRead = useCallback((id: string) => {
    api.post(`/api/chat/conversations/${encodeURIComponent(id)}/read`).catch(() => undefined);
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!visible) return;
    setLoadingList((value) => value || conversations.length === 0);
    setError(null);
    try {
      const params = new URLSearchParams();
      const trimmed = query.trim();
      if (trimmed) params.set('bookingRef', trimmed);
      if (channel !== 'all') params.set('channel', channel);
      const data = await api.get<ConversationsResponse>(`/api/chat/conversations?${params.toString()}`);
      setConversations(data.conversations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load chat hub.');
    } finally {
      setLoadingList(false);
    }
  }, [channel, conversations.length, query, visible]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    const data = await api.get<MessagesResponse>(
      `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=60`,
    );
    setMessages(data.messages ?? []);
    markRead(conversationId);
  }, [markRead]);

  const openConversation = useCallback(async (conversation: ConversationSummary) => {
    setSelected(conversation);
    setDetail(null);
    setMessages([]);
    setText('');
    setError(null);
    setLoadingChat(true);
    try {
      const [nextDetail] = await Promise.all([
        api.get<ConversationDetail>(`/api/chat/conversations/${encodeURIComponent(conversation.id)}`),
        fetchMessages(conversation.id),
      ]);
      setDetail(nextDetail);
      setConversations((items) =>
        items.map((item) => (item.id === conversation.id ? { ...item, unreadCount: 0 } : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this conversation.');
    } finally {
      setLoadingChat(false);
    }
  }, [fetchMessages]);

  useEffect(() => {
    if (!visible) return;
    void fetchConversations();
    const timer = setInterval(() => {
      void fetchConversations();
      if (selected) fetchMessages(selected.id).catch(() => undefined);
    }, 10_000);
    return () => clearInterval(timer);
  }, [fetchConversations, fetchMessages, selected, visible]);

  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setDetail(null);
      setMessages([]);
      setText('');
      setError(null);
    }
  }, [visible]);

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (!selected || !body || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await api.post<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(selected.id)}/messages`,
        { body, messageType: 'text' },
      );
      setMessages((items) => [...items, sent]);
      setText('');
      markRead(selected.id);
      void fetchConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  }, [fetchConversations, markRead, selected, sending, text]);

  const inputDisabled =
    sending ||
    loadingChat ||
    !selected ||
    detail?.locked === true ||
    detail?.status === 'closed' ||
    detail?.status === 'archived';

  const headerTitle = selected ? `#${selected.bookingRef}` : 'Chat hub';
  const headerSubtitle = selected
    ? CHANNEL_LABELS[selected.channel]
    : `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title} numberOfLines={1}>{headerTitle}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{headerSubtitle}</Text>
            </View>
            {selected ? (
              <AppButton label="Back" variant="secondary" onPress={() => setSelected(null)} style={styles.headerButton} />
            ) : null}
            <AppButton label="Close" variant="ghost" onPress={onClose} style={styles.headerButton} />
          </View>

          {error ? (
            <View style={styles.noticeWrap}>
              <StatusBanner kind="err" message={error} />
            </View>
          ) : null}

          {selected ? (
            <>
              <ScrollView
                ref={scrollRef}
                style={styles.messages}
                contentContainerStyle={styles.messagesContent}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              >
                {loadingChat && messages.length === 0 ? (
                  <View style={styles.loading}>
                    <ActivityIndicator color={colors.accent} />
                    <Text style={styles.muted}>Opening conversation...</Text>
                  </View>
                ) : messages.length === 0 && !error ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>No messages yet</Text>
                    <Text style={styles.muted}>Send the first message from the hub.</Text>
                  </View>
                ) : (
                  messages.map((message) => {
                    const mine = message.senderRole === 'admin';
                    return (
                      <View
                        key={message.id}
                        style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowOther]}
                      >
                        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                          <Text style={[styles.sender, mine ? styles.senderMine : styles.senderOther]}>
                            {mine ? 'Admin' : message.senderName || message.senderRole}
                          </Text>
                          <Text style={[styles.body, mine ? styles.bodyMine : styles.bodyOther]}>
                            {message.body || 'Attachment'}
                          </Text>
                          <Text style={[styles.time, mine ? styles.timeMine : styles.timeOther]}>
                            {formatTime(message.createdAt)}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              <View style={styles.composer}>
                {inputDisabled && !loadingChat ? (
                  <Text style={styles.inputHint}>This conversation cannot accept new messages right now.</Text>
                ) : null}
                <View style={styles.inputRow}>
                  <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder="Message..."
                    placeholderTextColor={colors.subtle}
                    editable={!inputDisabled}
                    style={styles.input}
                    multiline
                  />
                  <AppButton
                    label={sending ? 'Sending...' : 'Send'}
                    variant="primary"
                    onPress={handleSend}
                    loading={sending}
                    disabled={inputDisabled || !text.trim()}
                    style={styles.sendButton}
                  />
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.filters}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={() => void fetchConversations()}
                  placeholder="Search booking ref..."
                  placeholderTextColor={colors.subtle}
                  style={styles.searchInput}
                  autoCapitalize="characters"
                />
                <AppButton label="Refresh" variant="secondary" onPress={fetchConversations} style={styles.refreshButton} />
              </View>
              <View style={styles.channelFilters}>
                {CHANNEL_FILTERS.map((item) => {
                  const active = item.value === channel;
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => setChannel(item.value)}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.filterPill,
                        active && styles.filterPillActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {loadingList && conversations.length === 0 ? (
                  <View style={styles.loading}>
                    <ActivityIndicator color={colors.accent} />
                    <Text style={styles.muted}>Loading chat hub...</Text>
                  </View>
                ) : conversations.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>No conversations found</Text>
                    <Text style={styles.muted}>Driver and customer chats will appear here.</Text>
                  </View>
                ) : (
                  conversations.map((conversation) => (
                    <Pressable
                      key={conversation.id}
                      onPress={() => void openConversation(conversation)}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.conversationCard,
                        conversation.unreadCount > 0 && styles.conversationCardUnread,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.conversationTop}>
                        <Text style={styles.bookingRef}>#{conversation.bookingRef}</Text>
                        {conversation.unreadCount > 0 ? (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadText}>{conversation.unreadCount}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.metaRow}>
                        <Text style={styles.channelLabel}>{CHANNEL_LABELS[conversation.channel]}</Text>
                        <Text style={styles.statusText}>{conversation.status}</Text>
                        <Text style={styles.timeLabel}>{formatRelative(conversation.lastMessageAt)}</Text>
                      </View>
                      <Text style={styles.people} numberOfLines={1}>
                        {conversation.customerName || 'Customer'}
                        {conversation.driverName ? ` - Driver: ${conversation.driverName}` : ''}
                      </Text>
                      <Text style={styles.preview} numberOfLines={2}>
                        {conversation.lastMessageSenderRole === 'admin' ? 'You: ' : ''}
                        {conversation.lastMessageBody || 'No message preview yet'}
                      </Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  keyboard: { flex: 1 },
  header: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: fontSize.sm, marginTop: 2 },
  headerButton: { minWidth: 76 },
  noticeWrap: { paddingHorizontal: space.lg, paddingTop: space.md },
  filters: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    color: colors.text,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
  },
  refreshButton: { minWidth: 96 },
  channelFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  filterPill: {
    height: 42,
    minHeight: 42,
    minWidth: 74,
    alignSelf: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  filterPillActive: { borderColor: colors.accent, backgroundColor: colors.warningBg },
  filterPillText: { color: colors.muted, fontSize: fontSize.sm, fontWeight: '800' },
  filterPillTextActive: { color: colors.accent },
  list: { flex: 1 },
  listContent: { flexGrow: 1, gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.xl },
  conversationCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: space.xs,
  },
  conversationCardUnread: { borderColor: colors.accent },
  conversationTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bookingRef: { flex: 1, color: colors.text, fontSize: fontSize.lg, fontWeight: '900' },
  unreadBadge: {
    minWidth: 24,
    minHeight: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { color: colors.accentText, fontSize: fontSize.xs, fontWeight: '900' },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  channelLabel: { color: colors.info, fontSize: fontSize.xs, fontWeight: '800' },
  statusText: { color: colors.success, fontSize: fontSize.xs, fontWeight: '800' },
  timeLabel: { color: colors.muted, fontSize: fontSize.xs },
  people: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  preview: { color: colors.muted, fontSize: fontSize.sm, lineHeight: 20 },
  messages: { flex: 1 },
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
  },
  loading: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  empty: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  emptyTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '900' },
  muted: { color: colors.muted, fontSize: fontSize.sm },
  messageRow: { flexDirection: 'row' },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowOther: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '84%',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 2,
  },
  bubbleMine: { backgroundColor: colors.accent, borderColor: colors.accentHover },
  bubbleOther: { backgroundColor: colors.surface, borderColor: colors.border },
  sender: { fontSize: fontSize.xs, fontWeight: '900' },
  senderMine: { color: colors.accentText },
  senderOther: { color: colors.muted },
  body: { fontSize: fontSize.md, lineHeight: 20 },
  bodyMine: { color: colors.accentText },
  bodyOther: { color: colors.text },
  time: { fontSize: 10, marginTop: 2, textAlign: 'right' },
  timeMine: { color: 'rgba(9,9,11,0.72)' },
  timeOther: { color: colors.subtle },
  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.xs,
  },
  inputHint: { color: colors.warning, fontSize: fontSize.xs, fontWeight: '800' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 116,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    color: colors.text,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fontSize.md,
  },
  sendButton: { minWidth: 88 },
  pressed: { opacity: 0.78 },
});
