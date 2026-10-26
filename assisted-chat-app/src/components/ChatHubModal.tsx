import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api, ApiError, getAdminToken, getApiContextRevision } from '@/lib/api';
import { getAdminSessionRevision } from '@/hooks/useAdminSession';
import { useChatSounds } from '@/hooks/useChatSounds';
import { useChatVoiceRecorder } from '@/hooks/useChatVoiceRecorder';
import { chatMessageDisplayText } from '@/lib/chat-message-display';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius, space } from './theme';
import { ChatScreenLayout, useChatBottomPadding } from './chat/ChatScreenLayout';
import { useDriverList, type DriverListItem } from '@/hooks/useDriverList';
import { uploadChatImageAttachment, uploadChatVoiceAttachment, type ChatLocalAsset } from '@/lib/chat-attachments';
import { saveChatAttachmentToDevice } from '@/lib/chat-download';
import { ChatComposerIconButton } from './ChatComposerIconButton';
import { ChatImageBubble, ChatPhotoPreview } from './ChatImageBubble';
import { VoiceMessageBubble } from './VoiceMessageBubble';
import { usePolling } from '@/hooks/usePolling';
import {
  appendConversationPage,
  createClientMessageId,
  mergeConversationPages,
  mergeMessages,
  newestServerMessageId,
  replaceMessage,
  setLocalState,
  type LocalSendState,
} from '@/lib/chat-sync';

type ChatChannel = 'customer_admin' | 'customer_driver' | 'admin_driver';
type ChatRole = 'customer' | 'admin' | 'driver';
type ConversationStatus = 'open' | 'closed' | 'archived';
type MessageType = 'text' | 'image' | 'audio' | 'admin_note';
type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed';

interface ConversationSummary {
  scope?: 'booking' | 'direct_driver';
  id: string;
  bookingId: string | null;
  bookingRef: string | null;
  channel: ChatChannel;
  status: ConversationStatus;
  locked: boolean;
  muted: boolean;
  customerName: string;
  driverId: string | null;
  driverName: string | null;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  lastMessageSenderRole: ChatRole | null;
  unreadCount: number;
  createdAt: string;
  lastActivityAt?: string;
  bookingStatus?: string | null;
}

interface ConversationDetail {
  id: string;
  bookingId: string | null;
  bookingRef: string | null;
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
  attachments: AttachmentView[];
  deleted?: boolean;
  createdAt: string;
  /** Present only on a message this device is sending or failed to send. */
  localState?: LocalSendState;
}

interface AttachmentView {
  id: string;
  url: string;
  mimeType: string;
  fileSize: number;
  fileName: string | null;
  deleted?: boolean;
}

interface ConversationsResponse {
  conversations: ConversationSummary[];
  nextCursor?: string | null;
}

interface CreateConversationResponse {
  conversationId: string;
}

interface MessagesResponse {
  messages: MessageView[];
  nextCursor: string | null;
}

interface Props {
  visible: boolean;
  initialConversationId?: string | null;
  /** The only kind of thread the notification may open (default: customer). */
  initialConversationChannel?: 'customer_admin' | 'admin_driver';
  entryMode?: 'all' | 'drivers';
  onClose: () => void;
  onDismiss?: () => void;
}

const CHANNEL_LABELS: Record<ChatChannel, string> = {
  customer_admin: 'Customer / Admin',
  customer_driver: 'Customer / Driver',
  admin_driver: 'Driver / Admin',
};

type InboxTab = 'all' | 'customers' | 'drivers' | 'closed';

// Customers holds open customer/admin and customer/driver threads; Closed holds
// closed and archived threads of every kind. A message never reopens a thread.
const INBOX_TABS: Array<{ value: InboxTab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'customers', label: 'Customers' },
  { value: 'drivers', label: 'Drivers' },
  { value: 'closed', label: 'Closed' },
];

const LIST_PAGE_SIZE = 100;
const MESSAGE_PAGE_SIZE = 60;
const SEARCH_DEBOUNCE_MS = 350;

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

function formatRecordingTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getAudioAttachment(message: MessageView): AttachmentView | null {
  return message.attachments.find((attachment) => !attachment.deleted && attachment.mimeType.startsWith('audio/')) ?? null;
}

function getImageAttachment(message: MessageView): AttachmentView | null {
  return message.attachments.find((attachment) => !attachment.deleted && attachment.mimeType.startsWith('image/')) ?? null;
}

function isDeletedMessage(message: MessageView): boolean {
  return Boolean(message.deleted || (!message.body && !getAudioAttachment(message) && !getImageAttachment(message)));
}

function getDriverChatBooking(driver: DriverListItem | null): { id: string; ref: string | null; active: boolean } | null {
  if (!driver) return null;
  if (driver.activeJobId) {
    return { id: driver.activeJobId, ref: driver.activeJobRef ?? null, active: true };
  }
  if (driver.latestJobId) {
    return { id: driver.latestJobId, ref: driver.latestJobRef ?? null, active: false };
  }
  return null;
}

export function ChatHubModal({ visible, onClose, onDismiss, entryMode = 'all', initialConversationId, initialConversationChannel = 'customer_admin' }: Props) {
  const { drivers, loading: driversLoading, error: driversError, reload: reloadDrivers } = useDriverList(visible);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<ConversationSummary | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [channel, setChannel] = useState<InboxTab>('all');
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [loadingMoreList, setLoadingMoreList] = useState(false);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [openingDriverChat, setOpeningDriverChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<MessageView | null>(null);
  const [editTarget, setEditTarget] = useState<MessageView | null>(null);
  const [editText, setEditText] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // Prepending older messages must not jump the view to the bottom.
  const keepScrollPositionRef = useRef(false);
  const scrollMetricsRef = useRef({ offset: 0, height: 0, content: 0 });
  // Media sends keep one client ID and one uploaded attachment per captured
  // file, so a retry repeats the identical request and the server stores it once.
  const mediaSendIdsRef = useRef(new Map<string, { id: string; attachment?: object }>());
  const sendRequestRef = useRef<object | null>(null);
  const messageFetchRef = useRef(0);
  const acceptedMessagesRef = useRef<{ id: string; messages: MessageView[] } | null>(null);
  const notificationTargetRef = useRef<string | null>(null);
  const bottomPadding = useChatBottomPadding();
  const scopeKey = `${getAdminSessionRevision()}:${getApiContextRevision()}`;
  const scopeRef = useRef({ visible, scopeKey, generation: 0, conversationId: null as string | null });
  // Start a new fence generation when visibility or account scope changes.
  // Done in a layout effect (refs must not be written during render); it
  // still runs before any passive effect or user event of this commit.
  useLayoutEffect(() => {
    if (scopeRef.current.visible !== visible || scopeRef.current.scopeKey !== scopeKey) {
      scopeRef.current = { visible, scopeKey, generation: scopeRef.current.generation + 1, conversationId: null };
    }
  }, [visible, scopeKey]);
  const driverRequestRef = useRef<object | null>(null);
  const listRequestRef = useRef(0);
  const { observeMessages, playSent } = useChatSounds({ visible, conversationId: selected?.id ?? null, scopeKey });
  const captureScope = useCallback(() => ({ ...scopeRef.current, token: getAdminToken(), apiRevision: getApiContextRevision(), sessionRevision: getAdminSessionRevision() }), []);
  const isCurrent = useCallback((scope: ReturnType<typeof captureScope>, conversationId?: string) => (
    scopeRef.current.visible && scope.visible && scope.scopeKey === scopeRef.current.scopeKey &&
    scope.generation === scopeRef.current.generation && scope.token === getAdminToken() &&
    scope.apiRevision === getApiContextRevision() && scope.sessionRevision === getAdminSessionRevision() &&
    (!conversationId || scopeRef.current.conversationId === conversationId)
  ), []);
  const { state: recorderState, start: startRecording, finish: finishRecording, cancel: cancelRecording, getState: getRecordingState } = useChatVoiceRecorder({ visible, conversationId: selected?.id ?? null, scopeKey });
  const returnToList = useCallback(() => {
    setPreviewUri(null);
    void cancelRecording();
    scopeRef.current.generation += 1;
    sendRequestRef.current = null; messageFetchRef.current += 1;
    scopeRef.current.conversationId = null;
    driverRequestRef.current = null;
    setOpeningDriverChat(false);
    setSelected(null); setDetail(null); setMessages([]); setText(''); setSending(false); setMediaBusy(false); setVoiceBusy(false); setStatusBusy(false);
    setActionTarget(null); setEditTarget(null); setActionBusy(false); setError(null);
  }, [cancelRecording]);

  const closeChat = useCallback(() => {
    setPreviewUri(null);
    void cancelRecording();
    scopeRef.current.visible = false;
    scopeRef.current.generation += 1;
    sendRequestRef.current = null;
    messageFetchRef.current += 1;
    onClose();
  }, [onClose, cancelRecording]);

  const sortedDrivers = useMemo(
    () =>
      [...drivers].sort((a, b) => {
        const aActive = a.activeJobId ? 0 : 1;
        const bActive = b.activeJobId ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        const aOnline = a.isOnline ? 0 : 1;
        const bOnline = b.isOnline ? 0 : 1;
        if (aOnline !== bOnline) return aOnline - bOnline;
        return a.name.localeCompare(b.name);
      }),
    [drivers],
  );

  const visibleDrivers = useMemo(() => {
    if (entryMode !== 'drivers' || !query.trim()) return sortedDrivers;
    const nameQuery = query.trim().toLocaleLowerCase();
    const phoneQuery = query.replace(/\D/g, '');
    return sortedDrivers.filter((driver) => driver.name.toLocaleLowerCase().includes(nameQuery) ||
      Boolean(phoneQuery && driver.phone?.replace(/\D/g, '').includes(phoneQuery)));
  }, [entryMode, query, sortedDrivers]);
  const visibleConversations = useMemo(() => {
    if (entryMode !== 'drivers' || !query.trim()) return conversations;
    const matchingDriverIds = new Set(visibleDrivers.map((driver) => driver.id));
    const nameQuery = query.trim().toLocaleLowerCase();
    return conversations.filter((conversation) => Boolean(conversation.driverId && matchingDriverIds.has(conversation.driverId)) ||
      Boolean(conversation.driverName?.toLocaleLowerCase().includes(nameQuery)));
  }, [conversations, entryMode, query, visibleDrivers]);

  const selectedDriver = useMemo(
    () => sortedDrivers.find((driver) => driver.id === selectedDriverId) ?? null,
    [selectedDriverId, sortedDrivers],
  );

  // The marker is the newest message actually shown, and is sent only while the
  // app is in the foreground, so nothing that arrives unseen is marked read.
  const markRead = useCallback((id: string, lastReadMessageId: string | null) => {
    if (!lastReadMessageId || AppState.currentState !== 'active') return;
    api.post(`/api/chat/conversations/${encodeURIComponent(id)}/read`, { lastReadMessageId }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const listParams = useCallback((before?: string | null) => {
    const params = new URLSearchParams({ limit: String(LIST_PAGE_SIZE) });
    if (entryMode === 'drivers') {
      // Driver search is matched locally against the driver list below.
      params.set('channel', 'admin_driver');
    } else {
      if (debouncedQuery) params.set('q', debouncedQuery);
      if (channel !== 'all') params.set('box', channel);
    }
    if (before) params.set('before', before);
    return params;
  }, [channel, debouncedQuery, entryMode]);
  const listKey = listParams().toString();
  const listKeyRef = useRef(listKey);

  const fetchConversations = useCallback(async () => {
    if (!visible) return;
    const scope = captureScope();
    const request = ++listRequestRef.current;
    const key = listKey;
    const filtersChanged = listKeyRef.current !== key;
    setLoadingList((value) => value || conversations.length === 0 || filtersChanged);
    setError(null);
    try {
      const data = await api.get<ConversationsResponse>(`/api/chat/conversations?${listParams().toString()}`);
      if (!isCurrent(scope) || request !== listRequestRef.current) return;
      const page = data.conversations ?? [];
      const complete = !data.nextCursor;
      // A refresh keeps older pages the operator already loaded; new filters start over.
      const sameFilters = listKeyRef.current === key;
      listKeyRef.current = key;
      setConversations((items) => (sameFilters ? mergeConversationPages(items, page, complete) : page));
      setListCursor((cursor) => (sameFilters && cursor && !complete ? cursor : data.nextCursor ?? null));
    } catch (err) {
      if (isCurrent(scope) && request === listRequestRef.current) setError(err instanceof Error ? err.message : 'Could not load chat hub.');
    } finally {
      if (isCurrent(scope) && request === listRequestRef.current) setLoadingList(false);
    }
  }, [captureScope, conversations.length, isCurrent, listKey, listParams, visible]);

  const loadMoreConversations = useCallback(async () => {
    if (!listCursor || loadingMoreList) return;
    const scope = captureScope();
    const key = listKeyRef.current;
    setLoadingMoreList(true);
    try {
      const data = await api.get<ConversationsResponse>(`/api/chat/conversations?${listParams(listCursor).toString()}`);
      if (!isCurrent(scope) || listKeyRef.current !== key) return;
      setConversations((items) => appendConversationPage(items, data.conversations ?? []));
      setListCursor(data.nextCursor ?? null);
    } catch (err) {
      if (isCurrent(scope)) setError(err instanceof Error ? err.message : 'Could not load older conversations.');
    } finally {
      if (isCurrent(scope)) setLoadingMoreList(false);
    }
  }, [captureScope, isCurrent, listCursor, listParams, loadingMoreList]);

  const fetchMessages = useCallback(async (conversationId: string, options?: { initial?: boolean }) => {
    const scope = captureScope();
    const request = ++messageFetchRef.current;
    const data = await api.get<MessagesResponse>(
      `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=${MESSAGE_PAGE_SIZE}`,
    );
    if (!isCurrent(scope, conversationId) || request !== messageFetchRef.current) return;
    const latest = data.messages ?? [];
    acceptedMessagesRef.current = { id: conversationId, messages: latest };
    // Merge rather than replace: older pages and unsent local messages stay.
    setMessages((items) => mergeMessages(items, latest));
    if (options?.initial) setOlderCursor(data.nextCursor ?? null);
    observeMessages(latest, conversationId);
    markRead(conversationId, newestServerMessageId(latest));
  }, [captureScope, isCurrent, markRead, observeMessages]);

  const loadOlderMessages = useCallback(async () => {
    if (!selected || !olderCursor || loadingOlder) return;
    const conversationId = selected.id;
    const scope = captureScope();
    setLoadingOlder(true);
    try {
      const data = await api.get<MessagesResponse>(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=${MESSAGE_PAGE_SIZE}&cursor=${encodeURIComponent(olderCursor)}`,
      );
      if (!isCurrent(scope, conversationId)) return;
      keepScrollPositionRef.current = true;
      setMessages((items) => mergeMessages(items, data.messages ?? []));
      setOlderCursor(data.nextCursor ?? null);
    } catch (err) {
      if (isCurrent(scope, conversationId)) setError(err instanceof Error ? err.message : 'Could not load earlier messages.');
    } finally {
      if (isCurrent(scope, conversationId)) setLoadingOlder(false);
    }
  }, [captureScope, isCurrent, loadingOlder, olderCursor, selected]);

  // A fast response can finish before the new chat's layout effect installs its sound scope.
  // Replay only the accepted snapshot after commit; the tracker suppresses duplicate observations.
  useEffect(() => {
    const snapshot = acceptedMessagesRef.current;
    if (visible && !loadingChat && snapshot && snapshot.id === selected?.id) observeMessages(snapshot.messages, snapshot.id);
  }, [selected?.id, loadingChat, messages, observeMessages, visible]);

  const openConversation = useCallback(async (conversation: ConversationSummary) => {
    scopeRef.current.generation += 1;
    scopeRef.current.conversationId = conversation.id;
    acceptedMessagesRef.current = null;
    sendRequestRef.current = null; messageFetchRef.current += 1;
    const scope = captureScope();
    setSending(false); setMediaBusy(false); setActionBusy(false); setActionTarget(null); setEditTarget(null); setStatusBusy(false);
    setSelected(conversation);
    setDetail(null);
    setMessages([]);
    setOlderCursor(null);
    setLoadingOlder(false);
    scrollMetricsRef.current = { offset: 0, height: 0, content: 0 };
    setText('');
    setError(null);
    setLoadingChat(true);
    try {
      const [nextDetail] = await Promise.all([
        api.get<ConversationDetail>(`/api/chat/conversations/${encodeURIComponent(conversation.id)}`),
        fetchMessages(conversation.id, { initial: true }),
      ]);
      if (!isCurrent(scope, conversation.id)) return;
      setDetail(nextDetail);
      setConversations((items) =>
        items.map((item) => (item.id === conversation.id ? { ...item, unreadCount: 0 } : item)),
      );
    } catch (err) {
      if (isCurrent(scope, conversation.id)) setError(err instanceof Error ? err.message : 'Could not open this conversation.');
    } finally {
      if (isCurrent(scope, conversation.id)) setLoadingChat(false);
    }
  }, [captureScope, fetchMessages, isCurrent]);

  const openDriverConversation = useCallback(async (driver: DriverListItem) => {
    if (driverRequestRef.current) return;
    const request = {};
    driverRequestRef.current = request;
    const scope = captureScope();
    setSelectedDriverId(driver.id);
    setOpeningDriverChat(true);
    setError(null);
    try {
      const created = await api.post<CreateConversationResponse>('/api/chat/conversations/direct-driver', { driverId: driver.id });
      if (!isCurrent(scope)) return;
      const fallback: ConversationSummary = {
        id: created.conversationId, scope: 'direct_driver', bookingId: null, bookingRef: null,
        channel: 'admin_driver', status: 'open', locked: false, muted: false,
        customerName: '', driverId: driver.id, driverName: driver.name,
        lastMessageBody: null, lastMessageAt: null, lastMessageSenderRole: null,
        unreadCount: 0, createdAt: new Date().toISOString(),
      };
      await openConversation(fallback);
    } catch (err) {
      if (isCurrent(scope)) {
        const code = err instanceof ApiError && err.details && typeof err.details === 'object'
          ? (err.details as { code?: unknown }).code : null;
        setError(err instanceof ApiError && (err.status === 404 || code === 'DIRECT_DRIVER_CHAT_UNAVAILABLE')
          ? 'Direct driver chat needs a server update. Refresh after the server has been updated.'
          : err instanceof Error ? err.message : 'Could not open private driver chat.');
      }
    } finally {
      if (driverRequestRef.current === request) {
        driverRequestRef.current = null;
        if (scopeRef.current.visible) setOpeningDriverChat(false);
      }
    }
  }, [captureScope, isCurrent, openConversation]);

  // Never overlapping, paused in the background, and re-run on return to the
  // foreground so anything missed while away is reconciled from the server.
  // Requests already discard stale responses through the scope fences.
  usePolling(fetchConversations, { enabled: visible, intervalMs: 10_000, key: `${scopeKey}|${listKey}` });
  const selectedId = selected?.id ?? null;
  const pollMessages = useCallback(async () => {
    if (selectedId) await fetchMessages(selectedId).catch(() => undefined);
  }, [fetchMessages, selectedId]);
  usePolling(pollMessages, { enabled: visible && Boolean(selectedId), intervalMs: 10_000, key: `${scopeKey}|${selectedId}`, immediate: false });

  useLayoutEffect(() => {
    scopeRef.current.visible = visible;
    // Keep the native presenter while clearing data before a retained host
    // reopens or changes administrator/project scope.
    setPreviewUri(null);
    driverRequestRef.current = null;
    sendRequestRef.current = null;
    messageFetchRef.current += 1;
    listRequestRef.current += 1;
    acceptedMessagesRef.current = null;
    scopeRef.current.conversationId = null;
    setSending(false); setMediaBusy(false); setVoiceBusy(false); setOpeningDriverChat(false); setLoadingChat(false); setLoadingList(false);
    setConversations([]);
    setSelected(null);
    setDetail(null);
    setMessages([]);
    setText('');
    setError(null);
    setSelectedDriverId(null);
    setActionTarget(null);
    setEditTarget(null);
    setEditText('');
    setListCursor(null); setLoadingMoreList(false); setOlderCursor(null); setLoadingOlder(false);
    mediaSendIdsRef.current.clear();
    if (visible) setChannel('all');
    return () => { scopeRef.current.visible = false; scopeRef.current.generation += 1; };
  }, [entryMode, scopeKey, visible]);

  useEffect(() => {
    if (!visible || !initialConversationId) { notificationTargetRef.current = null; return; }
    if (notificationTargetRef.current === initialConversationId || !/^[0-9a-f-]{36}$/i.test(initialConversationId)) return;
    notificationTargetRef.current = initialConversationId;
    let active = true;
    const scope = captureScope();
    void api.get<ConversationDetail>(`/api/chat/conversations/${encodeURIComponent(initialConversationId)}`)
      .then(async (target) => {
        if (!active || !isCurrent(scope) || target.channel !== initialConversationChannel) return;
        await openConversation({ ...target, scope: target.bookingId ? 'booking' : 'direct_driver', customerName: '', driverId: null, driverName: null,
          lastMessageBody: null, lastMessageAt: null, lastMessageSenderRole: null, unreadCount: 0, createdAt: '' });
      }).catch((reason) => { if (active && isCurrent(scope)) setError(reason instanceof Error ? reason.message : 'Could not open this chat.'); });
    return () => { active = false; };
  }, [captureScope, initialConversationChannel, initialConversationId, isCurrent, openConversation, scopeKey, visible]);

  const updateMessage = useCallback((updated: MessageView) => {
    setMessages((items) => items.map((item) => (item.id === updated.id ? updated : item)));
  }, []);

  // Delivers one text message under its client ID. Retrying the same message
  // reuses the ID, so the server stores it once even if an earlier attempt
  // succeeded but its response was lost.
  const deliverText = useCallback(async (message: MessageView) => {
    if (!selected || sendRequestRef.current) return;
    const conversationId = selected.id;
    const scope = captureScope();
    if (!isCurrent(scope, conversationId)) return;
    const request = {};
    sendRequestRef.current = request;
    setSending(true);
    setError(null);
    setMessages((items) => setLocalState(items, message.id, 'sending'));
    try {
      const sent = await api.post<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
        { body: message.body, messageType: 'text', clientMessageId: message.id },
      );
      if (!isCurrent(scope, conversationId)) return;
      messageFetchRef.current += 1;
      setMessages((items) => replaceMessage(items, message.id, sent));
      playSent(sent.id);
      markRead(conversationId, sent.id);
      void fetchConversations();
    } catch (err) {
      if (!isCurrent(scope, conversationId)) return;
      setMessages((items) => setLocalState(items, message.id, 'failed'));
      setError(err instanceof Error ? `${err.message} Tap the message to try again.` : 'Could not send message. Tap it to try again.');
    } finally {
      if (sendRequestRef.current === request) sendRequestRef.current = null;
      if (isCurrent(scope, conversationId)) setSending(false);
    }
  }, [captureScope, fetchConversations, isCurrent, markRead, playSent, selected]);

  // Closed threads stay closed: new messages never reopen them, and nobody can
  // post until staff reopen. History is kept either way.
  const changeConversationStatus = useCallback(async (next: 'close' | 'reopen') => {
    if (!selected || statusBusy) return;
    const conversationId = selected.id;
    const scope = captureScope();
    setStatusBusy(true);
    setError(null);
    try {
      await api.patch(`/api/chat/conversations/${encodeURIComponent(conversationId)}`, next === 'close' ? { close: true } : { reopen: true });
      const nextDetail = await api.get<ConversationDetail>(`/api/chat/conversations/${encodeURIComponent(conversationId)}`);
      if (!isCurrent(scope, conversationId)) return;
      setDetail(nextDetail);
      setConversations((items) => items.map((item) => (item.id === conversationId
        ? { ...item, status: nextDetail.status, locked: nextDetail.locked } : item)));
      void fetchConversations();
    } catch (err) {
      if (isCurrent(scope, conversationId)) setError(err instanceof Error ? err.message : 'Could not update this conversation.');
    } finally {
      if (isCurrent(scope, conversationId)) setStatusBusy(false);
    }
  }, [captureScope, fetchConversations, isCurrent, selected, statusBusy]);

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (!selected || !body || sending || sendRequestRef.current || getRecordingState().phase !== 'idle') return;
    const optimistic: MessageView = {
      id: createClientMessageId(), senderId: '', senderName: 'Admin', senderRole: 'admin', body,
      messageType: 'text', deliveryStatus: 'sending', attachments: [], createdAt: new Date().toISOString(), localState: 'sending',
    };
    setMessages((items) => mergeMessages(items, []).concat(optimistic));
    setText('');
    await deliverText(optimistic);
  }, [deliverText, getRecordingState, selected, sending, text]);

  const discardFailed = useCallback((message: MessageView) => {
    if (message.localState !== 'failed') return;
    setMessages((items) => items.filter((item) => item.id !== message.id));
    // Give the text back so nothing typed is lost.
    if (message.body) setText((current) => current || message.body || '');
  }, []);

  const inputDisabled =
    sending ||
    voiceBusy ||
    recorderState.phase !== 'idle' ||
    mediaBusy ||
    loadingChat ||
    !selected ||
    detail?.locked === true ||
    detail?.status === 'closed' ||
    detail?.status === 'archived';
  const recordingComposerActive = recorderState.phase !== 'idle';

  const startVoiceRecording = useCallback(async () => {
    if (inputDisabled || voiceBusy || sendRequestRef.current) return;
    const scope = captureScope();
    setError(null);
    try { await startRecording(); }
    catch (err) { if (isCurrent(scope)) setError(err instanceof Error ? err.message : 'Could not start voice recording.'); }
  }, [captureScope, inputDisabled, isCurrent, voiceBusy, startRecording]);

  const cancelVoiceRecording = useCallback(async () => {
    await cancelRecording();
    setVoiceBusy(false);
  }, [cancelRecording]);

  const sendVoiceRecording = useCallback(async () => {
    if (!selected || voiceBusy || sending || sendRequestRef.current) return;
    const scope = captureScope();
    if (!isCurrent(scope, selected.id)) return;
    const request = {};
    sendRequestRef.current = request;
    setVoiceBusy(true);
    setError(null);
    try {
      const uri = await finishRecording();
      if (!uri || !isCurrent(scope, selected.id)) return;
      const pending = mediaSendIdsRef.current.get(uri) ?? { id: createClientMessageId() };
      mediaSendIdsRef.current.set(uri, pending);
      const clientMessageId = pending.id;
      const attachment = pending.attachment ?? await uploadChatVoiceAttachment(uri);
      pending.attachment = attachment;
      if (!isCurrent(scope, selected.id) || getRecordingState().phase !== 'ready') return;
      const sent = await api.post<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(selected.id)}/messages`,
        { body: null, messageType: 'audio', attachment, clientMessageId },
      );
      if (!isCurrent(scope, selected.id)) return;
      mediaSendIdsRef.current.delete(uri);
      messageFetchRef.current += 1;
      setMessages((items) => mergeMessages(items, [sent]));
      playSent(sent.id);
      markRead(selected.id, sent.id);
      void fetchConversations();
      await cancelRecording();
    } catch (err) {
      if (isCurrent(scope, selected.id)) setError(err instanceof Error ? err.message : 'Could not send voice message. Tap Send voice to retry.');
    } finally {
      if (sendRequestRef.current === request) sendRequestRef.current = null;
      if (isCurrent(scope, selected.id)) setVoiceBusy(false);
    }
  }, [captureScope, fetchConversations, getRecordingState, isCurrent, markRead, playSent, selected, sending, voiceBusy, cancelRecording, finishRecording]);

  const sendImageAsset = useCallback(async (asset: ChatLocalAsset) => {
    if (!selected || mediaBusy || sending || sendRequestRef.current || getRecordingState().phase !== 'idle') return;
    const scope = captureScope();
    if (!isCurrent(scope, selected.id)) return;
    const request = {};
    sendRequestRef.current = request;
    setMediaBusy(true);
    setSending(true);
    setError(null);
    try {
      const pending = mediaSendIdsRef.current.get(asset.uri) ?? { id: createClientMessageId() };
      mediaSendIdsRef.current.set(asset.uri, pending);
      const clientMessageId = pending.id;
      const attachment = pending.attachment ?? await uploadChatImageAttachment(asset);
      pending.attachment = attachment;
      if (!isCurrent(scope, selected.id)) return;
      const sent = await api.post<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(selected.id)}/messages`,
        { body: null, messageType: 'image', attachment, clientMessageId },
      );
      if (!isCurrent(scope, selected.id)) return;
      mediaSendIdsRef.current.delete(asset.uri);
      messageFetchRef.current += 1;
      setMessages((items) => mergeMessages(items, [sent]));
      playSent(sent.id);
      markRead(selected.id, sent.id);
      void fetchConversations();
    } catch (err) {
      if (isCurrent(scope, selected.id)) setError(err instanceof Error ? err.message : 'Could not send photo.');
    } finally {
      if (sendRequestRef.current === request) sendRequestRef.current = null;
      if (isCurrent(scope, selected.id)) { setSending(false); setMediaBusy(false); }
    }
  }, [captureScope, fetchConversations, getRecordingState, isCurrent, markRead, mediaBusy, playSent, selected, sending]);

  const pickImageFromLibrary = useCallback(async () => {
    if (inputDisabled || !selected) return;
    const scope = captureScope();
    if (!isCurrent(scope, selected.id)) return;
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!isCurrent(scope, selected.id)) return;
      if (!permission.granted) {
        setError('Photo library permission is required to send an image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.82,
      });
      if (!isCurrent(scope, selected.id) || result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await sendImageAsset({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        file: asset.file,
      });
    } catch (err) {
      if (isCurrent(scope, selected.id)) setError(err instanceof Error ? err.message : 'Could not open photo library.');
    }
  }, [captureScope, selected, inputDisabled, isCurrent, sendImageAsset]);

  const takeCameraPhoto = useCallback(async () => {
    if (inputDisabled || !selected) return;
    const scope = captureScope();
    if (!isCurrent(scope, selected.id)) return;
    setError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!isCurrent(scope, selected.id)) return;
      if (!permission.granted) {
        setError('Camera permission is required to send a photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.82,
        cameraType: ImagePicker.CameraType.back,
      });
      if (!isCurrent(scope, selected.id) || result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await sendImageAsset({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        file: asset.file,
      });
    } catch (err) {
      if (isCurrent(scope, selected.id)) setError(err instanceof Error ? err.message : 'Could not open camera.');
    }
  }, [captureScope, selected, inputDisabled, isCurrent, sendImageAsset]);

  const handleSaveMessageAttachment = useCallback(async (message: MessageView) => {
    const attachment = getImageAttachment(message) ?? getAudioAttachment(message);
    if (!attachment) return;
    const scope = captureScope();
    if (!isCurrent(scope)) return;
    setActionBusy(true);
    setError(null);
    try {
      await saveChatAttachmentToDevice({
        url: attachment.url,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
      });
      if (isCurrent(scope)) setActionTarget(null);
    } catch (err) {
      if (isCurrent(scope)) setError(err instanceof Error ? err.message : 'Could not save attachment.');
    } finally {
      if (isCurrent(scope)) setActionBusy(false);
    }
  }, [captureScope, isCurrent]);

  const handleDeleteMessage = useCallback(async (message: MessageView) => {
    if (!selected) return;
    const scope = captureScope();
    if (!isCurrent(scope, selected.id)) return;
    setActionBusy(true);
    setError(null);
    try {
      const updated = await api.patch<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(selected.id)}/messages/${encodeURIComponent(message.id)}`,
        { action: 'delete' },
      );
      if (!isCurrent(scope, selected.id)) return;
      messageFetchRef.current += 1;
      updateMessage(updated);
      setActionTarget(null);
      void fetchConversations();
    } catch (err) {
      if (isCurrent(scope, selected.id)) setError(err instanceof Error ? err.message : 'Could not delete message.');
    } finally {
      if (isCurrent(scope, selected.id)) setActionBusy(false);
    }
  }, [captureScope, isCurrent, fetchConversations, selected, updateMessage]);

  const beginEditMessage = useCallback((message: MessageView) => {
    setEditTarget(message);
    setEditText(message.body ?? '');
    setActionTarget(null);
  }, []);

  const submitEditMessage = useCallback(async () => {
    const body = editText.trim();
    if (!selected || !editTarget || !body) return;
    const scope = captureScope();
    if (!isCurrent(scope, selected.id)) return;
    setActionBusy(true);
    setError(null);
    try {
      const updated = await api.patch<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(selected.id)}/messages/${encodeURIComponent(editTarget.id)}`,
        { action: 'edit', body },
      );
      if (!isCurrent(scope, selected.id)) return;
      messageFetchRef.current += 1;
      updateMessage(updated);
      setEditTarget(null);
      setEditText('');
      void fetchConversations();
    } catch (err) {
      if (isCurrent(scope, selected.id)) setError(err instanceof Error ? err.message : 'Could not edit message.');
    } finally {
      if (isCurrent(scope, selected.id)) setActionBusy(false);
    }
  }, [captureScope, isCurrent, editTarget, editText, fetchConversations, selected, updateMessage]);

  const directSelected = selected?.scope === 'direct_driver' || Boolean(selected && !selected.bookingId);
  const headerTitle = selected
    ? selected.channel === 'admin_driver' ? selected.driverName || 'Driver chat' : selected.customerName || 'Customer chat'
    : entryMode === 'drivers' ? 'Chat with a driver' : 'Messages';
  const headerSubtitle = selected ? directSelected ? 'Private admin / driver conversation' : CHANNEL_LABELS[selected.channel] : 'Choose a driver or continue a conversation';
  const handleRequestClose = () => {
    if (previewUri) setPreviewUri(null);
    else if (editTarget) { setEditTarget(null); setEditText(''); }
    else if (actionTarget) setActionTarget(null);
    else closeChat();
  };

  return (
    <Modal visible={visible} presentationStyle="fullScreen" animationType="slide" onRequestClose={handleRequestClose} onDismiss={onDismiss}>
      <ChatScreenLayout title={headerTitle} subtitle={headerSubtitle}
        reference={selected && !directSelected && selected.bookingRef ? `#${selected.bookingRef}` : null}
        onBack={selected ? returnToList : undefined} onClose={closeChat}>
          {error ? (
            <View style={styles.noticeWrap}>
              <StatusBanner kind="err" message={error} />
            </View>
          ) : null}

          {selected ? (
            <>
              {detail ? (
                <View style={styles.threadBar}>
                  <Text style={styles.threadStatus} accessibilityLiveRegion="polite">
                    {detail.status === 'open' ? (detail.locked ? 'Open · locked' : 'Open') : detail.status === 'closed' ? 'Closed' : 'Archived'}
                  </Text>
                  <AppButton
                    label={detail.status === 'open' ? 'Close conversation' : 'Reopen'}
                    variant="secondary"
                    onPress={() => { void changeConversationStatus(detail.status === 'open' ? 'close' : 'reopen'); }}
                    loading={statusBusy}
                    disabled={statusBusy || loadingChat}
                    style={styles.threadAction}
                  />
                </View>
              ) : null}
              <ScrollView
                ref={scrollRef}
                style={styles.messages}
                contentContainerStyle={styles.messagesContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                scrollEventThrottle={32}
                onScroll={(event) => {
                  const { contentOffset, layoutMeasurement } = event.nativeEvent;
                  scrollMetricsRef.current.offset = contentOffset.y;
                  scrollMetricsRef.current.height = layoutMeasurement.height;
                }}
                onContentSizeChange={(_, contentHeight) => {
                  const metrics = scrollMetricsRef.current;
                  const previous = metrics.content;
                  metrics.content = contentHeight;
                  if (keepScrollPositionRef.current) {
                    // Older messages were prepended: keep the same message in view.
                    keepScrollPositionRef.current = false;
                    scrollRef.current?.scrollTo({ y: metrics.offset + (contentHeight - previous), animated: false });
                    return;
                  }
                  // Follow new messages only when already at the bottom, so reading
                  // history is never interrupted by an incoming message.
                  if (previous === 0 || metrics.offset + metrics.height >= previous - 120) {
                    scrollRef.current?.scrollToEnd({ animated: previous !== 0 });
                  }
                }}
              >
                {olderCursor ? (
                  <Pressable
                    onPress={() => { void loadOlderMessages(); }}
                    disabled={loadingOlder}
                    accessibilityRole="button"
                    accessibilityLabel="Load earlier messages"
                    style={({ pressed }) => [styles.loadEarlier, pressed && styles.pressed]}
                  >
                    {loadingOlder ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.loadEarlierText}>Load earlier messages</Text>}
                  </Pressable>
                ) : null}
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
                    const audioAttachment = getAudioAttachment(message);
                    const imageAttachment = getImageAttachment(message);
                    const deleted = isDeletedMessage(message);
                    const mediaMessage = !deleted && Boolean(imageAttachment || audioAttachment);
                    const bubbleStyle = [styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther];
                    const bubbleContent = (
                      <>
                        <Text style={[styles.sender, mine ? styles.senderMine : styles.senderOther]}>
                          {mine ? 'Admin' : message.senderName || message.senderRole}
                        </Text>
                        {deleted ? (
                          <Text style={[styles.body, styles.deletedBody, mine ? styles.bodyMine : styles.bodyOther]}>
                            Message deleted
                          </Text>
                        ) : imageAttachment ? (
                          <ChatImageBubble
                            uri={imageAttachment.url}
                            mine={mine}
                            onPreview={setPreviewUri}
                            onLongPress={() => setActionTarget(message)}
                          />
                        ) : audioAttachment ? (
                          <VoiceMessageBubble
                            uri={audioAttachment.url}
                        active={visible}
                        scopeKey={scopeKey}
                            mine={mine}
                            onLongPress={() => setActionTarget(message)}
                          />
                        ) : (
                          <Text style={[styles.body, mine ? styles.bodyMine : styles.bodyOther]}>
                            {chatMessageDisplayText(message.body || 'Attachment')}
                          </Text>
                        )}
                        <Text
                          style={[styles.time, mine ? styles.timeMine : styles.timeOther, message.localState === 'failed' && styles.timeFailed]}
                          accessibilityLiveRegion={message.localState ? 'polite' : 'none'}
                        >
                          {message.localState === 'sending'
                            ? 'Sending…'
                            : message.localState === 'failed'
                              ? 'Not sent · Tap to retry · Hold to remove'
                              : mine ? `${formatTime(message.createdAt)} · Sent` : formatTime(message.createdAt)}
                        </Text>
                      </>
                    );
                    if (message.localState) {
                      return (
                        <View key={message.id} style={[styles.messageRow, styles.messageRowMine]}>
                          <Pressable
                            onPress={() => { if (message.localState === 'failed') void deliverText(message); }}
                            onLongPress={() => discardFailed(message)}
                            disabled={message.localState !== 'failed'}
                            accessibilityRole="button"
                            accessibilityLabel={message.localState === 'failed' ? 'Message not sent. Double tap to try again.' : 'Sending message'}
                            style={[bubbleStyle, message.localState === 'sending' && styles.bubbleSending, message.localState === 'failed' && styles.bubbleFailed]}
                          >
                            {bubbleContent}
                          </Pressable>
                        </View>
                      );
                    }
                    return (
                      <View
                        key={message.id}
                        style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowOther]}
                      >
                        {mediaMessage ? (
                          <View style={bubbleStyle}>{bubbleContent}</View>
                        ) : (
                          <Pressable
                            onLongPress={() => setActionTarget(message)}
                            delayLongPress={280}
                            style={bubbleStyle}
                          >
                            {bubbleContent}
                          </Pressable>
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>

              <View style={[styles.composer, { paddingBottom: bottomPadding }]}>
                {inputDisabled && !loadingChat && !recordingComposerActive ? (
                  <Text style={styles.inputHint}>This conversation cannot accept new messages right now.</Text>
                ) : null}
                {recordingComposerActive ? (
                  <View style={styles.recordingRow}>
                    <View style={styles.recordingPill}>
                      <View style={styles.recordingDot} />
                      <Text style={styles.recordingText}>
                        {recorderState.phase === 'preparing' ? 'Preparing microphone...' : recorderState.phase === 'ready' ? 'Voice ready' : recorderState.phase === 'stopping' ? 'Finishing...' : 'Recording'} {formatRecordingTime(recorderState.durationMillis)}
                      </Text>
                    </View>
                    <AppButton
                      label="Cancel"
                      variant="secondary"
                      onPress={() => { void cancelVoiceRecording(); }}
                      disabled={voiceBusy}
                      style={styles.recordCancelButton}
                    />
                    <AppButton
                      label={voiceBusy ? 'Sending...' : 'Send voice'}
                      variant="primary"
                      onPress={() => { void sendVoiceRecording(); }}
                      loading={voiceBusy}
                      disabled={voiceBusy || recorderState.phase === 'preparing' || recorderState.phase === 'stopping'}
                      style={styles.recordSendButton}
                    />
                  </View>
                ) : (
                  <View style={styles.composerFields}>
                    <TextInput
                      value={text}
                      onChangeText={setText}
                      placeholder="Message..."
                      placeholderTextColor={colors.subtle}
                      editable={!inputDisabled}
                      style={styles.input}
                      multiline
                      maxLength={5000}
                      accessibilityLabel="Message text"
                    />
                    <View style={styles.inputRow}>
                    <ChatComposerIconButton
                      icon="image-outline"
                      label="Send image"
                      onPress={() => { void pickImageFromLibrary(); }}
                      disabled={inputDisabled}
                      loading={mediaBusy}
                    />
                    <ChatComposerIconButton
                      icon="camera-outline"
                      label="Take photo"
                      onPress={() => { void takeCameraPhoto(); }}
                      disabled={inputDisabled}
                      loading={mediaBusy}
                    />
                    <ChatComposerIconButton
                      icon="mic-outline"
                      label="Record voice message"
                      onPress={() => { void startVoiceRecording(); }}
                      disabled={inputDisabled}
                      loading={voiceBusy}
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
                )}
              </View>
            </>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding + space.lg }]} keyboardShouldPersistTaps="handled">
              <View style={styles.filters}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={() => void fetchConversations()}
                  placeholder={entryMode === 'drivers' ? 'Search driver name or phone...' : 'Search ref, name, phone or driver...'}
                  placeholderTextColor={colors.subtle}
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  accessibilityLabel={entryMode === 'drivers' ? 'Search drivers' : 'Search conversations'}
                />
                <AppButton label="Refresh" variant="secondary" onPress={fetchConversations} style={styles.refreshButton} />
              </View>
              <View style={styles.driverPrivateCard}>
                <View style={styles.driverPrivateHeader}>
                  <View style={styles.driverPrivateCopy}>
                    <Text style={styles.driverPrivateTitle}>Private driver chat</Text>
                    <Text style={styles.driverPrivateSubtitle}>
                      Tap a driver to chat. No booking or assignment needed.
                    </Text>
                  </View>
                  <AppButton
                    label="Reload"
                    variant="secondary"
                    onPress={reloadDrivers}
                    loading={driversLoading}
                    style={styles.reloadDriversButton}
                  />
                </View>
                {driversError ? <StatusBanner kind="err" message={driversError} /> : null}
                <View style={styles.driverMenu}>
                  {driversLoading && visibleDrivers.length === 0 ? (
                    <View style={styles.driverEmptyChip}>
                      <ActivityIndicator color={colors.accent} />
                      <Text style={styles.driverEmptyText}>Loading drivers...</Text>
                    </View>
                  ) : visibleDrivers.length === 0 ? (
                    <View style={styles.driverEmptyChip}>
                      <Text style={styles.driverEmptyText}>{query.trim() ? 'No matching drivers' : 'No drivers found'}</Text>
                    </View>
                  ) : (
                    visibleDrivers.map((driver) => (
                      <DriverMenuItem
                        key={driver.id}
                        driver={driver}
                        selected={driver.id === selectedDriverId}
                        busy={openingDriverChat && driver.id === selectedDriverId}
                        disabled={openingDriverChat}
                        onPress={() => { void openDriverConversation(driver); }}
                      />
                    ))
                  )}
                </View>
              </View>
              {entryMode !== 'drivers' ? <View style={styles.channelFilters}>
                {INBOX_TABS.map((item) => {
                  const active = item.value === channel;
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => setChannel(item.value)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
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
              </View> : null}

              <Text style={styles.sectionTitle}>Recent conversations</Text>
                {loadingList && visibleConversations.length === 0 ? (
                  <View style={styles.loading}>
                    <ActivityIndicator color={colors.accent} />
                    <Text style={styles.muted}>Loading chat hub...</Text>
                  </View>
                ) : visibleConversations.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>No conversations found</Text>
                    <Text style={styles.muted}>
                      {selectedDriver
                        ? 'No private chats found for this driver yet.'
                        : 'Driver and customer chats will appear here.'}
                    </Text>
                  </View>
                ) : (
                  visibleConversations.map((conversation) => (
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
                        <Text style={styles.bookingRef}>{conversation.scope === 'direct_driver' || !conversation.bookingId ? conversation.driverName || 'Driver chat' : `#${conversation.bookingRef}`}</Text>
                        {conversation.unreadCount > 0 ? (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadText}>{conversation.unreadCount}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.metaRow}>
                        <Text style={styles.channelLabel}>{CHANNEL_LABELS[conversation.channel]}</Text>
                        <Text style={styles.statusText}>{conversation.status}</Text>
                        <Text style={styles.timeLabel}>{formatRelative(conversation.lastMessageAt ?? conversation.lastActivityAt ?? null)}</Text>
                      </View>
                      <Text style={styles.people} numberOfLines={1}>
                        {conversation.scope === 'direct_driver' || !conversation.bookingId ? 'Private driver chat' : conversation.customerName || 'Customer'}
                        {conversation.driverName ? ` - Driver: ${conversation.driverName}` : ''}
                      </Text>
                      {conversation.bookingId && conversation.bookingStatus ? (
                        <Text style={styles.bookingStatus} numberOfLines={1}>Booking: {conversation.bookingStatus.replace(/_/g, ' ')}</Text>
                      ) : null}
                      <Text style={styles.preview} numberOfLines={2}>
                        {conversation.lastMessageSenderRole === 'admin' ? 'You: ' : ''}
                        {conversation.lastMessageBody || 'No message preview yet'}
                      </Text>
                    </Pressable>
                  ))
                )}
                {listCursor && visibleConversations.length > 0 ? (
                  <AppButton
                    label="Show older conversations"
                    variant="secondary"
                    onPress={() => { void loadMoreConversations(); }}
                    loading={loadingMoreList}
                    disabled={loadingMoreList}
                  />
                ) : null}
            </ScrollView>
          )}
          <MessageActionsOverlay
            visible={Boolean(actionTarget)}
            message={actionTarget}
            busy={actionBusy}
            canEdit={Boolean(
              actionTarget &&
                actionTarget.senderRole === 'admin' &&
                !isDeletedMessage(actionTarget) &&
                (actionTarget.messageType === 'text' || actionTarget.messageType === 'admin_note'),
            )}
            canSave={Boolean(actionTarget && (getImageAttachment(actionTarget) || getAudioAttachment(actionTarget)))}
            canDelete={Boolean(actionTarget && !isDeletedMessage(actionTarget))}
            onClose={() => setActionTarget(null)}
            onSave={() => {
              if (actionTarget) void handleSaveMessageAttachment(actionTarget);
            }}
            onEdit={() => {
              if (actionTarget) beginEditMessage(actionTarget);
            }}
            onDelete={() => {
              if (actionTarget) void handleDeleteMessage(actionTarget);
            }}
          />
          <EditMessageOverlay
            visible={Boolean(editTarget)}
            value={editText}
            busy={actionBusy}
            onChangeText={setEditText}
            onCancel={() => {
              setEditTarget(null);
              setEditText('');
            }}
            onSave={() => {
              void submitEditMessage();
            }}
          />
          <ChatPhotoPreview uri={previewUri} onClose={() => setPreviewUri(null)} />
      </ChatScreenLayout>
    </Modal>
  );
}

function MessageActionsOverlay({
  visible,
  message,
  busy,
  canEdit,
  canSave,
  canDelete,
  onClose,
  onSave,
  onEdit,
  onDelete,
}: {
  visible: boolean;
  message: MessageView | null;
  busy: boolean;
  canEdit: boolean;
  canSave: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!visible) return null;
  return (
      <Pressable style={styles.actionBackdrop} onPress={onClose} accessibilityViewIsModal>
        <Pressable style={styles.actionSheet}>
          <View style={styles.actionHandle} />
          <Text style={styles.actionTitle}>Message tools</Text>
          <Text style={styles.actionSubtitle} numberOfLines={1}>
            {message?.messageType === 'audio' ? 'Voice message' : message?.messageType === 'image' ? 'Photo' : 'Chat message'}
          </Text>
          {canSave ? <ActionSheetButton label="Save" disabled={busy} onPress={onSave} /> : null}
          {canEdit ? <ActionSheetButton label="Edit" disabled={busy} onPress={onEdit} /> : null}
          {canDelete ? <ActionSheetButton label="Delete" danger disabled={busy} onPress={onDelete} /> : null}
          <ActionSheetButton label="Cancel" disabled={busy} onPress={onClose} />
        </Pressable>
      </Pressable>
  );
}

function EditMessageOverlay({
  visible,
  value,
  busy,
  onChangeText,
  onCancel,
  onSave,
}: {
  visible: boolean;
  value: string;
  busy: boolean;
  onChangeText: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (!visible) return null;
  return (
      <View style={styles.actionBackdrop} accessibilityViewIsModal>
        <View style={styles.actionSheet}>
          <View style={styles.actionHandle} />
          <Text style={styles.actionTitle}>Edit message</Text>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder="Message..."
            placeholderTextColor={colors.subtle}
            style={styles.editInput}
            multiline
            maxLength={5000}
          />
          <View style={styles.editActions}>
            <ActionSheetButton label="Cancel" disabled={busy} onPress={onCancel} />
            <ActionSheetButton label="Save" disabled={busy || !value.trim()} onPress={onSave} />
          </View>
        </View>
      </View>
  );
}

function ActionSheetButton({
  label,
  danger,
  disabled,
  onPress,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.actionButton,
        danger && styles.actionButtonDanger,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.actionButtonText, danger && styles.actionButtonTextDanger]}>{label}</Text>
    </Pressable>
  );
}

function DriverMenuItem({
  driver,
  selected,
  onPress,
  busy,
  disabled,
}: {
  driver: DriverListItem;
  selected: boolean;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const chatBooking = getDriverChatBooking(driver);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Chat with ${driver.name}`}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.driverChip,
        selected && styles.driverChipSelected,

        pressed && styles.pressed,
      ]}
    >
      <View style={styles.driverChipCopy}>
      <View style={styles.driverChipTop}>
        <View
          style={[
            styles.driverStatusDot,
            driver.isOnline ? styles.driverStatusDotOnline : styles.driverStatusDotOffline,
          ]}
        />
        <Text style={[styles.driverChipName, selected && styles.driverChipNameSelected]}>
          {driver.name}
        </Text>
      </View>
      <Text style={styles.driverChipMeta} numberOfLines={1}>
        {driver.status ?? (driver.isOnline ? 'online' : 'offline')}
      </Text>
      <Text
        style={[
          styles.driverChipJob,
          chatBooking?.active ? styles.driverChipJobActive : styles.driverChipJobLatest,
        ]}
        numberOfLines={1}
      >
        {chatBooking?.ref
          ? `${chatBooking.active ? 'Active' : 'Latest'} #${chatBooking.ref}`
          : 'Direct conversation'}
      </Text>
      </View>
      {busy ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.driverChatAction}>{'Chat >'}</Text>}
    </Pressable>
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
    paddingTop: space.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
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
  driverPrivateCard: {
    marginTop: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: space.sm,
  },
  driverPrivateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  driverPrivateCopy: { flex: 1, minWidth: 0 },
  driverPrivateTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '900' },
  driverPrivateSubtitle: { color: colors.muted, fontSize: fontSize.xs, lineHeight: 16, marginTop: 2 },
  reloadDriversButton: { minWidth: 86 },
  driverMenu: {
    gap: space.sm,
    paddingVertical: 2,
    paddingRight: space.xs,
  },
  driverChipCopy: { flex: 1, minWidth: 0, gap: 4 },
  driverChatAction: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  driverChip: {
    width: '100%',
    minHeight: 76,
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    padding: space.sm,
    gap: 4,
  },
  driverChipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.warningBg,
  },
  driverChipMuted: {
    opacity: 0.72,
  },
  driverChipTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  driverStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  driverStatusDotOnline: { backgroundColor: colors.success },
  driverStatusDotOffline: { backgroundColor: colors.muted },
  driverChipName: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  driverChipNameSelected: { color: colors.accent },
  driverChipMeta: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '700' },
  driverChipJob: { fontSize: fontSize.xs, fontWeight: '900' },
  driverChipJobActive: { color: colors.success },
  driverChipJobLatest: { color: colors.info },
  driverChipJobMissing: { color: colors.warning },
  driverEmptyChip: {
    minHeight: 72,
    minWidth: 156,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: space.sm,
  },
  driverEmptyText: { color: colors.muted, fontSize: fontSize.sm, fontWeight: '800' },
  driverPrivateActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  driverPrivateStatus: { flex: 1, minWidth: 0 },
  driverPrivateStatusLabel: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '800' },
  driverPrivateStatusValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '900', marginTop: 2 },
  driverPrivateStatusMeta: { fontSize: fontSize.xs, fontWeight: '800', marginTop: 2 },
  driverPrivateStatusOk: { color: colors.success },
  driverPrivateStatusWarn: { color: colors.warning },
  openDriverChatButton: { minWidth: 154 },
  channelFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  filterPill: {
    minHeight: 48,
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
  sectionTitle: { color: colors.muted, fontSize: 13, fontWeight: '800', marginTop: space.sm },
  list: { flex: 1, minHeight: 0, backgroundColor: '#000000' },
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
  messages: { flex: 1, minHeight: 0, backgroundColor: '#000000' },
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
  body: { fontSize: fontSize.md, lineHeight: 23, textAlign: 'auto', writingDirection: 'auto', flexShrink: 1 },
  bodyMine: { color: colors.accentText },
  bodyOther: { color: colors.text },
  deletedBody: { fontStyle: 'italic', opacity: 0.72 },
  time: { fontSize: 10, marginTop: 2, textAlign: 'right' },
  timeMine: { color: 'rgba(9,9,11,0.72)' },
  // Status text stays dark on the accent bubble; the border carries the state.
  timeFailed: { color: colors.accentText, fontWeight: '800' },
  threadBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm,
    paddingHorizontal: space.md, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  threadStatus: { color: colors.muted, fontSize: fontSize.sm, fontWeight: '700', flexShrink: 1 },
  threadAction: { minHeight: 44 },
  bookingStatus: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '700' },
  bubbleSending: { opacity: 0.85 },
  bubbleFailed: { borderColor: colors.danger, borderWidth: 2 },
  loadEarlier: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    marginBottom: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  loadEarlierText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  timeOther: { color: colors.subtle },
  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#000000',
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: space.xs,
  },
  inputHint: { color: colors.warning, fontSize: fontSize.xs, fontWeight: '800' },
  composerFields: { gap: space.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  input: {
    width: '100%',
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
    textAlign: 'auto', writingDirection: 'auto', textAlignVertical: 'top',
  },
  sendButton: { flex: 1, minWidth: 84, minHeight: 48 },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  recordingPill: {
    flex: 1,
    minWidth: 170,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
  },
  recordingText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '900' },
  recordCancelButton: { minWidth: 82 },
  recordSendButton: { minWidth: 122 },
  actionBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: 'rgba(1,3,10,0.72)',
    justifyContent: 'flex-end',
    padding: space.lg,
  },
  actionSheet: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: space.sm,
  },
  actionHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: space.xs,
  },
  actionTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '900' },
  actionSubtitle: { color: colors.muted, fontSize: fontSize.sm, fontWeight: '700' },
  actionButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  actionButtonDanger: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  actionButtonDisabled: { opacity: 0.46 },
  actionButtonText: { color: colors.text, fontSize: fontSize.md, fontWeight: '900' },
  actionButtonTextDanger: { color: colors.danger },
  editInput: {
    minHeight: 96,
    maxHeight: 180,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    color: colors.text,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fontSize.md,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  pressed: { opacity: 0.78 },
});
