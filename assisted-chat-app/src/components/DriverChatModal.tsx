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

type ChatRole = 'customer' | 'admin' | 'driver';
type MessageType = 'text' | 'image' | 'admin_note';
type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed';

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

interface ConversationDetail {
  id: string;
  status: 'open' | 'closed' | 'archived';
  locked: boolean;
}

interface Props {
  visible: boolean;
  bookingId: string | null;
  bookingRef: string | null;
  onClose: () => void;
}

interface CreateConversationResponse {
  conversationId: string;
}

interface MessagesResponse {
  messages: MessageView[];
  nextCursor: string | null;
}

function formatTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function DriverChatModal({ visible, bookingId, bookingRef, onClose }: Props) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const markRead = useCallback((id: string) => {
    api.post(`/api/chat/conversations/${encodeURIComponent(id)}/read`).catch(() => undefined);
  }, []);

  const fetchMessages = useCallback(async (id: string) => {
    const data = await api.get<MessagesResponse>(
      `/api/chat/conversations/${encodeURIComponent(id)}/messages?limit=50`,
    );
    setMessages(data.messages ?? []);
    markRead(id);
  }, [markRead]);

  const openConversation = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    setError(null);
    try {
      const created = await api.post<CreateConversationResponse>('/api/chat/conversations', {
        bookingId,
        channel: 'admin_driver',
      });
      setConversationId(created.conversationId);
      const [nextDetail] = await Promise.all([
        api.get<ConversationDetail>(
          `/api/chat/conversations/${encodeURIComponent(created.conversationId)}`,
        ),
        fetchMessages(created.conversationId),
      ]);
      setDetail(nextDetail);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not open driver chat';
      setError(
        msg.includes('No driver assigned') || msg.toLowerCase().includes('driver')
          ? 'Assign a driver first, then open chat.'
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }, [bookingId, fetchMessages]);

  useEffect(() => {
    if (!visible) return;
    setConversationId(null);
    setDetail(null);
    setMessages([]);
    setText('');
    void openConversation();
  }, [openConversation, visible]);

  useEffect(() => {
    if (!visible || !conversationId) return;
    const timer = setInterval(() => {
      fetchMessages(conversationId).catch(() => undefined);
    }, 5_000);
    return () => clearInterval(timer);
  }, [conversationId, fetchMessages, visible]);

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (!conversationId || !body || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await api.post<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
        { body, messageType: 'text' },
      );
      setMessages((prev) => [...prev, sent]);
      setText('');
      markRead(conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message');
    } finally {
      setSending(false);
    }
  }, [conversationId, markRead, sending, text]);

  const inputDisabled =
    loading ||
    sending ||
    !conversationId ||
    detail?.locked === true ||
    detail?.status === 'closed' ||
    detail?.status === 'archived';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Driver chat</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {bookingRef ? `#${bookingRef}` : 'Current booking'}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close driver chat"
              style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>

          {error ? (
            <View style={styles.noticeWrap}>
              <StatusBanner kind="err" message={error} />
            </View>
          ) : null}

          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {loading && messages.length === 0 ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.muted}>Opening driver chat...</Text>
              </View>
            ) : messages.length === 0 && !error ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.muted}>Send the first message to the driver.</Text>
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
                        {mine ? 'Admin' : message.senderName || 'Driver'}
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
            {detail?.locked ? (
              <Text style={styles.inputHint}>This conversation is locked.</Text>
            ) : detail?.status === 'closed' || detail?.status === 'archived' ? (
              <Text style={styles.inputHint}>This conversation is closed.</Text>
            ) : null}
            <View style={styles.inputRow}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Message driver..."
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
                style={styles.sendBtn}
              />
            </View>
          </View>
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
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: fontSize.sm, marginTop: 2 },
  closeBtn: {
    minHeight: 44,
    minWidth: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  closeBtnText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  btnPressed: { opacity: 0.76 },
  noticeWrap: { paddingHorizontal: space.lg, paddingTop: space.md },
  messages: { flex: 1 },
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  emptyTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: fontSize.sm },
  messageRow: { flexDirection: 'row' },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowOther: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 2,
  },
  bubbleMine: {
    backgroundColor: colors.accent,
    borderColor: colors.accentHover,
  },
  bubbleOther: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  sender: { fontSize: fontSize.xs, fontWeight: '800' },
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
  inputHint: { color: colors.warning, fontSize: fontSize.xs, fontWeight: '700' },
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
  sendBtn: { minWidth: 88 },
});
