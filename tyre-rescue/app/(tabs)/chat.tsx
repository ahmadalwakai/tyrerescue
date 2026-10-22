import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PHONE_TEL } from '@/src/config';
import { useCustomerAccount } from '@/src/customer-account';
import { customerChatHeaders, customerChatRequest, mergeCustomerChatMessages, newCustomerChatMessageId,
  type CustomerChatConversation, type CustomerChatMessage, type CustomerChatPage } from '@/src/customer-chat';
import { loadBookingAccess } from '@/src/customer-booking-access';
import { useBookingParamAccess } from '@/src/use-booking-param-access';
import { colors, spacing, typography } from '@/src/theme';
import { Card, Logo, PrimaryButton, ScreenHeader, useScreenContentInsets } from '@/src/ui';

function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }

export default function CustomerChatScreen() {
  const params = useLocalSearchParams<{ bookingId?: string; conversationId?: string; refNumber?: string; ref?: string; bookingAccessToken?: string }>();
  const { token, loading, sessionRevision } = useCustomerAccount();
  const router = useRouter();
  const bookingId = single(params.bookingId);
  const conversationId = single(params.conversationId);
  const refNumber = single(params.refNumber) || single(params.ref);
  const parameterAccess = useBookingParamAccess(single(params.bookingAccessToken), sessionRevision);
  const providedAccess = parameterAccess.value;
  const [savedAccess, setSavedAccess] = useState<{ ref: string; revision: number; value: string | null } | null>(null);
  useEffect(() => {
    if (parameterAccess.invalidated) router.setParams({ bookingAccessToken: undefined });
  }, [parameterAccess.invalidated, router]);
  useEffect(() => {
    let active = true;
    if (loading || !refNumber || providedAccess) return;
    void loadBookingAccess(refNumber).then((value) => { if (active) setSavedAccess({ ref: refNumber, revision: sessionRevision, value }); })
      .catch(() => { if (active) setSavedAccess({ ref: refNumber, revision: sessionRevision, value: null }); });
    return () => { active = false; };
  }, [loading, providedAccess, refNumber, sessionRevision]);
  const savedReady = savedAccess?.ref === refNumber && savedAccess.revision === sessionRevision;
  const access = providedAccess || (savedReady ? savedAccess.value : null);
  if (loading || (refNumber && !providedAccess && !savedReady)) {
    return <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Opening secure chat…</Text></View>;
  }
  // Remount the session on account/booking changes so old requests and drafts cannot cross scopes.
  return <ChatSession key={JSON.stringify([sessionRevision, token, access, bookingId, conversationId])} token={token} access={access}
    bookingId={bookingId} initialConversationId={conversationId} />;
}

function ChatSession({ token, access, bookingId, initialConversationId }: {
  token: string | null; access: string | null; bookingId: string; initialConversationId: string;
}) {
  const router = useRouter();
  const focused = useIsFocused();
  const contentInsets = useScreenContentInsets();
  const headers = useMemo(() => customerChatHeaders(token, access), [access, token]);
  const [conversation, setConversation] = useState<CustomerChatConversation | null>(null);
  const [conversations, setConversations] = useState<CustomerChatConversation[]>([]);
  const [messages, setMessages] = useState<CustomerChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [olderLoading, setOlderLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const alive = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const pendingSend = useRef<{ id: string; body: string } | null>(null);
  const sendBusy = useRef(false);
  const refreshBusy = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const scrollAfterLoad = useRef(true);
  const paginationInitialized = useRef(false);
  const request = useCallback(<T,>(path: string, init?: RequestInit) => customerChatRequest<T>(path, headers,
    { ...init, signal: controller.current?.signal }), [headers]);

  useEffect(() => {
    alive.current = true;
    controller.current = new AbortController();
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);

  const refreshConversation = useCallback(async (id: string, olderCursor?: string) => {
    const path = `/api/chat/conversations/${encodeURIComponent(id)}`;
    const [detail, page] = await Promise.all([
      request<CustomerChatConversation>(path),
      request<CustomerChatPage>(`${path}/messages?limit=50${olderCursor ? `&cursor=${encodeURIComponent(olderCursor)}` : ''}`),
    ]);
    if (!alive.current) return;
    if (detail.channel !== 'customer_admin') throw new Error('This conversation is not a customer support chat.');
    setConversation(detail);
    setMessages((current) => mergeCustomerChatMessages(current, page.messages));
    if (olderCursor || !paginationInitialized.current) { setNextCursor(page.nextCursor); paginationInitialized.current = true; }
    if (!pendingSend.current) setError('');
    if (!olderCursor && page.messages.length) {
      void request(`${path}/read`, { method: 'POST', body: JSON.stringify({ lastReadMessageId: page.messages[page.messages.length - 1].id }) }).catch(() => {});
    }
  }, [request]);

  useEffect(() => {
    if (!focused) return;
    let active = true;
    setLoading(true);
    setError('');
    async function open() {
      try {
        let id = initialConversationId;
        if (!id && bookingId && (token || access)) {
          const result = await request<{ conversationId: string }>('/api/chat/conversations', {
            method: 'POST', body: JSON.stringify({ bookingId, channel: 'customer_admin' }),
          });
          id = result.conversationId;
        }
        if (!active || !alive.current) return;
        if (id) await refreshConversation(id);
        else if (token) {
          const result = await request<{ conversations: CustomerChatConversation[] }>('/api/chat/conversations?channel=customer_admin');
          if (active && alive.current) setConversations(result.conversations);
        }
      } catch (reason) {
        if (active && alive.current) setError(reason instanceof Error ? reason.message : 'Unable to open chat.');
      } finally { if (active && alive.current) setLoading(false); }
    }
    void open();
    return () => { active = false; };
  }, [access, bookingId, focused, initialConversationId, refreshConversation, refreshTick, request, token]);

  useEffect(() => {
    if (!focused || !conversation?.id) return;
    const id = conversation.id;
    const timer = setInterval(() => {
      if (refreshBusy.current || sendBusy.current) return;
      refreshBusy.current = true;
      void refreshConversation(id).catch(() => { if (alive.current) setError('Chat could not refresh. Check your connection and tap Refresh.'); })
        .finally(() => { refreshBusy.current = false; });
    }, 6000);
    return () => clearInterval(timer);
  }, [conversation?.id, focused, refreshConversation]);

  async function send() {
    const body = draft.trim();
    if (!conversation || !body || sendBusy.current || conversation.locked || conversation.status !== 'open') return;
    const pending = pendingSend.current?.body === body ? pendingSend.current : { id: newCustomerChatMessageId(), body };
    pendingSend.current = pending;
    sendBusy.current = true;
    setSending(true);
    setError('');
    try {
      const message = await request<CustomerChatMessage>(`/api/chat/conversations/${conversation.id}/messages`, {
        method: 'POST', body: JSON.stringify({ body, messageType: 'text', clientMessageId: pending.id }),
      });
      if (!alive.current) return;
      setMessages((current) => mergeCustomerChatMessages(current, [message]));
      setDraft('');
      pendingSend.current = null;
      scrollAfterLoad.current = true;
    } catch (reason) {
      if (alive.current) setError(`${reason instanceof Error ? reason.message : 'Could not send your message.'} Your message is saved here; tap Send to retry.`);
    } finally {
      sendBusy.current = false;
      if (alive.current) setSending(false);
    }
  }

  async function older() {
    if (!conversation || !nextCursor || olderLoading) return;
    setOlderLoading(true);
    scrollAfterLoad.current = false;
    try { await refreshConversation(conversation.id, nextCursor); }
    catch { if (alive.current) setError('Unable to load older messages. Please try again.'); }
    finally { if (alive.current) setOlderLoading(false); }
  }

  const readOnly = conversation?.locked || (conversation && conversation.status !== 'open');
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, contentInsets]}
        onContentSizeChange={() => { if (scrollAfterLoad.current && conversation && messages.length) { scroll.current?.scrollToEnd({ animated: true }); scrollAfterLoad.current = false; } }}>
        <Logo compact />
        <ScreenHeader eyebrow={conversation?.bookingRef || 'Support'} title="Chat with us" detail="Message the Tyre Rescue team about your booking. For urgent help, call us." />
        <PrimaryButton icon="phone" variant="secondary" onPress={() => Linking.openURL(`tel:${PHONE_TEL}`)}>Call Tyre Rescue</PrimaryButton>
        {loading ? <ActivityIndicator accessibilityLabel="Loading conversations" color={colors.accent} /> : null}
        {error ? <Card><Text accessibilityRole="alert" style={styles.error}>{error}</Text><PrimaryButton variant="secondary" onPress={() => setRefreshTick((value) => value + 1)}>Refresh</PrimaryButton></Card> : null}
        {!loading && !conversation ? <>
          {conversations.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Open support chat for ${item.bookingRef}${item.unreadCount ? `, ${item.unreadCount} unread` : ''}`}
            onPress={() => router.push({ pathname: '/(tabs)/chat', params: { conversationId: item.id } })}>
            <Card><Text style={styles.heading}>{item.bookingRef} {item.unreadCount ? `· ${item.unreadCount} unread` : ''}</Text><Text style={styles.muted} numberOfLines={2}>{item.lastMessageBody || 'Start a conversation with our team'}</Text></Card>
          </Pressable>)}
          {!conversations.length ? <Card><Text style={styles.muted}>Open a booking from Track or Account to start a secure chat. You can also call the team for help before booking.</Text></Card> : null}
          {!token && !access ? <PrimaryButton variant="secondary" onPress={() => router.push('/(tabs)/account')}>Sign in to view your bookings</PrimaryButton> : null}
        </> : null}
        {conversation ? <>
          {nextCursor ? <PrimaryButton variant="secondary" loading={olderLoading} onPress={() => void older()}>Load older messages</PrimaryButton> : null}
          {!messages.length && !loading ? <Card><Text style={styles.muted}>Send your first message. Our team will reply here.</Text></Card> : null}
          {messages.map((message) => <View key={message.id} style={[styles.bubble, message.senderRole === 'customer' ? styles.customerBubble : styles.teamBubble]}>
            <Text style={styles.sender}>{message.senderRole === 'customer' ? 'You' : 'Tyre Rescue'}</Text>
            {message.deleted ? <Text style={styles.muted}>Message removed</Text> : <>
              {message.body ? <Text selectable style={styles.message}>{message.body}</Text> : null}
              {message.attachments.filter((attachment) => !attachment.deleted && /^https:\/\//i.test(attachment.url)).map((attachment) =>
                attachment.mimeType.startsWith('image/') ? <Image key={attachment.id} source={{ uri: attachment.url }} style={styles.photo} accessibilityLabel="Photo from Tyre Rescue" resizeMode="contain" /> :
                  attachment.mimeType.startsWith('audio/') ? <PrimaryButton key={attachment.id} icon="play" variant="secondary"
                    accessibilityLabel="Open voice message from Tyre Rescue" onPress={() => { void Linking.openURL(attachment.url).catch(() => setError('Unable to open this voice message. Please try again.')); }}>Open voice message</PrimaryButton> :
                    <Text key={attachment.id} style={styles.muted}>Attachment received.</Text>)}
            </>}
            <Text style={styles.time}>{new Date(message.createdAt).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</Text>
          </View>)}
          {readOnly ? <Card><Text style={styles.muted}>This conversation is {conversation.locked ? 'locked' : conversation.status}. You can still read messages or call the team.</Text></Card> : <View style={styles.composer}>
            <TextInput accessibilityLabel="Message to Tyre Rescue" placeholder="Type your message…" placeholderTextColor={colors.muted} value={draft}
              onChangeText={setDraft} editable={!sending} multiline maxLength={5000} style={styles.input} />
            <PrimaryButton icon="send" disabled={!draft.trim()} loading={sending} onPress={() => void send()}>Send</PrimaryButton>
          </View>}
        </> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.page, gap: 14, flexGrow: 1 },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 14 },
  heading: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 17 },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  error: { color: '#fca5a5', fontFamily: typography.body, lineHeight: 22 },
  bubble: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 7, maxWidth: '94%' },
  customerBubble: { alignSelf: 'flex-end', backgroundColor: '#3b230f' },
  teamBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  sender: { color: colors.accent, fontFamily: typography.bodyBold, fontSize: 12 },
  message: { color: colors.text, fontFamily: typography.body, fontSize: 15, lineHeight: 23 },
  time: { color: colors.muted, fontFamily: typography.body, fontSize: 11 },
  photo: { width: 250, height: 220, maxWidth: '100%', borderRadius: 8 },
  composer: { gap: 10 },
  input: { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 14, minHeight: 92, maxHeight: 200, textAlignVertical: 'top', fontFamily: typography.body, fontSize: 16 },
});
