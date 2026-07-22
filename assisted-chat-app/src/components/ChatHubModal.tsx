import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/lib/api';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius, space } from './theme';
import { AdminHeaderButton, AdminModalHeader, AdminModalShell } from './layout/AdminModalShell';
import { useDriverList, type DriverListItem } from '@/hooks/useDriverList';
import { uploadChatImageAttachment, type ChatLocalAsset } from '@/lib/chat-attachments';
import { saveChatAttachmentToDevice } from '@/lib/chat-download';
import { ChatComposerIconButton } from './ChatComposerIconButton';
import { ChatImageBubble } from './ChatImageBubble';
import { VoiceMessageBubble } from './VoiceMessageBubble';

type ChatChannel = 'customer_admin' | 'customer_driver' | 'admin_driver';
type ChatRole = 'customer' | 'admin' | 'driver';
type ConversationStatus = 'open' | 'closed' | 'archived';
type MessageType = 'text' | 'image' | 'audio' | 'admin_note';
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
  driverId: string | null;
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
  attachments: AttachmentView[];
  deleted?: boolean;
  createdAt: string;
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

const VOICE_UNAVAILABLE_MESSAGE =
  'Voice messages are temporarily disabled in this TestFlight build while the native audio crash is being fixed.';

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

export function ChatHubModal({ visible, onClose }: Props) {
  const { drivers, loading: driversLoading, error: driversError, reload: reloadDrivers } = useDriverList();
  const recorderState = { durationMillis: 0 };
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selected, setSelected] = useState<ConversationSummary | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState<'all' | ChatChannel>('all');
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
  const scrollRef = useRef<ScrollView>(null);

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

  const selectedDriver = useMemo(
    () => sortedDrivers.find((driver) => driver.id === selectedDriverId) ?? null,
    [selectedDriverId, sortedDrivers],
  );
  const selectedDriverBooking = useMemo(() => getDriverChatBooking(selectedDriver), [selectedDriver]);

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
      if (selectedDriverId) {
        params.set('driverId', selectedDriverId);
        params.set('channel', 'admin_driver');
      } else if (channel !== 'all') {
        params.set('channel', channel);
      }
      const data = await api.get<ConversationsResponse>(`/api/chat/conversations?${params.toString()}`);
      setConversations(data.conversations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load chat hub.');
    } finally {
      setLoadingList(false);
    }
  }, [channel, conversations.length, query, selectedDriverId, visible]);

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

  const openDriverConversation = useCallback(async () => {
    if (!selectedDriver || openingDriverChat) return;
    const chatBooking = getDriverChatBooking(selectedDriver);
    if (!chatBooking) {
      setError('This driver has no booking to attach a private chat to.');
      return;
    }

    setOpeningDriverChat(true);
    setError(null);
    try {
      const created = await api.post<CreateConversationResponse>('/api/chat/conversations', {
        bookingId: chatBooking.id,
        channel: 'admin_driver',
        driverId: selectedDriver.id,
      });
      const fallback: ConversationSummary = {
        id: created.conversationId,
        bookingId: chatBooking.id,
        bookingRef: chatBooking.ref ?? 'Driver chat',
        channel: 'admin_driver',
        status: 'open',
        locked: false,
        muted: false,
        customerName: 'Private driver chat',
        driverId: selectedDriver.id,
        driverName: selectedDriver.name,
        lastMessageBody: null,
        lastMessageAt: null,
        lastMessageSenderRole: null,
        unreadCount: 0,
        createdAt: new Date().toISOString(),
      };
      await openConversation(fallback);
      void fetchConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open private driver chat.');
    } finally {
      setOpeningDriverChat(false);
    }
  }, [fetchConversations, openConversation, openingDriverChat, selectedDriver]);

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
      setSelectedDriverId(null);
      setActionTarget(null);
      setEditTarget(null);
      setEditText('');
    }
  }, [visible]);

  const updateMessage = useCallback((updated: MessageView) => {
    setMessages((items) => items.map((item) => (item.id === updated.id ? updated : item)));
  }, []);

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
    voiceBusy ||
    mediaBusy ||
    loadingChat ||
    !selected ||
    detail?.locked === true ||
    detail?.status === 'closed' ||
    detail?.status === 'archived';
  const recordingComposerActive = false;

  const startVoiceRecording = useCallback(async () => {
    if (inputDisabled || voiceBusy) return;
    setError(VOICE_UNAVAILABLE_MESSAGE);
  }, [inputDisabled, voiceBusy]);

  const cancelVoiceRecording = useCallback(async () => {
    setVoiceBusy(false);
  }, []);

  const sendVoiceRecording = useCallback(async () => {
    setError(VOICE_UNAVAILABLE_MESSAGE);
  }, []);

  const sendImageAsset = useCallback(async (asset: ChatLocalAsset) => {
    if (!selected || mediaBusy || sending) return;
    setMediaBusy(true);
    setSending(true);
    setError(null);
    try {
      const attachment = await uploadChatImageAttachment(asset);
      const sent = await api.post<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(selected.id)}/messages`,
        { body: null, messageType: 'image', attachment },
      );
      setMessages((items) => [...items, sent]);
      markRead(selected.id);
      void fetchConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send photo.');
    } finally {
      setSending(false);
      setMediaBusy(false);
    }
  }, [fetchConversations, markRead, mediaBusy, selected, sending]);

  const pickImageFromLibrary = useCallback(async () => {
    if (inputDisabled) return;
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Photo library permission is required to send an image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.82,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await sendImageAsset({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        file: asset.file,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open photo library.');
    }
  }, [inputDisabled, sendImageAsset]);

  const takeCameraPhoto = useCallback(async () => {
    if (inputDisabled) return;
    setError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
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
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await sendImageAsset({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        file: asset.file,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open camera.');
    }
  }, [inputDisabled, sendImageAsset]);

  const handleSaveMessageAttachment = useCallback(async (message: MessageView) => {
    const attachment = getImageAttachment(message) ?? getAudioAttachment(message);
    if (!attachment) return;
    setActionBusy(true);
    setError(null);
    try {
      await saveChatAttachmentToDevice({
        url: attachment.url,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
      });
      setActionTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save attachment.');
    } finally {
      setActionBusy(false);
    }
  }, []);

  const handleDeleteMessage = useCallback(async (message: MessageView) => {
    if (!selected) return;
    setActionBusy(true);
    setError(null);
    try {
      const updated = await api.patch<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(selected.id)}/messages/${encodeURIComponent(message.id)}`,
        { action: 'delete' },
      );
      updateMessage(updated);
      setActionTarget(null);
      void fetchConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete message.');
    } finally {
      setActionBusy(false);
    }
  }, [fetchConversations, selected, updateMessage]);

  const beginEditMessage = useCallback((message: MessageView) => {
    setEditTarget(message);
    setEditText(message.body ?? '');
    setActionTarget(null);
  }, []);

  const submitEditMessage = useCallback(async () => {
    const body = editText.trim();
    if (!selected || !editTarget || !body) return;
    setActionBusy(true);
    setError(null);
    try {
      const updated = await api.patch<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(selected.id)}/messages/${encodeURIComponent(editTarget.id)}`,
        { action: 'edit', body },
      );
      updateMessage(updated);
      setEditTarget(null);
      setEditText('');
      void fetchConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not edit message.');
    } finally {
      setActionBusy(false);
    }
  }, [editTarget, editText, fetchConversations, selected, updateMessage]);

  const headerTitle = selected ? `#${selected.bookingRef}` : 'Chat hub';
  const headerSubtitle = selected
    ? `${CHANNEL_LABELS[selected.channel]}${selected.driverName ? ` - ${selected.driverName}` : ''}`
    : `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <AdminModalShell keyboardAvoidingEnabled={false}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'web' ? undefined : Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <AdminModalHeader
            title={headerTitle}
            subtitle={headerSubtitle}
            onClose={onClose}
            actions={selected ? (
              <AdminHeaderButton label="Back" onPress={() => setSelected(null)} />
            ) : null}
          />

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
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
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
                            onLongPress={() => setActionTarget(message)}
                          />
                        ) : audioAttachment ? (
                          <VoiceMessageBubble
                            uri={audioAttachment.url}
                            mine={mine}
                            onLongPress={() => setActionTarget(message)}
                          />
                        ) : (
                          <Text style={[styles.body, mine ? styles.bodyMine : styles.bodyOther]}>
                            {message.body || 'Attachment'}
                          </Text>
                        )}
                        <Text style={[styles.time, mine ? styles.timeMine : styles.timeOther]}>
                          {formatTime(message.createdAt)}
                        </Text>
                      </>
                    );
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

              <View style={styles.composer}>
                {inputDisabled && !loadingChat ? (
                  <Text style={styles.inputHint}>This conversation cannot accept new messages right now.</Text>
                ) : null}
                {recordingComposerActive ? (
                  <View style={styles.recordingRow}>
                    <View style={styles.recordingPill}>
                      <View style={styles.recordingDot} />
                      <Text style={styles.recordingText}>
                        Recording {formatRecordingTime(recorderState.durationMillis)}
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
                      disabled={voiceBusy}
                      style={styles.recordSendButton}
                    />
                  </View>
                ) : (
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
                )}
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
              <View style={styles.driverPrivateCard}>
                <View style={styles.driverPrivateHeader}>
                  <View style={styles.driverPrivateCopy}>
                    <Text style={styles.driverPrivateTitle}>Private driver chat</Text>
                    <Text style={styles.driverPrivateSubtitle}>
                      Choose a driver with an active job and open a private admin-driver conversation.
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
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.driverMenu}
                >
                  {driversLoading && sortedDrivers.length === 0 ? (
                    <View style={styles.driverEmptyChip}>
                      <ActivityIndicator color={colors.accent} />
                      <Text style={styles.driverEmptyText}>Loading drivers...</Text>
                    </View>
                  ) : sortedDrivers.length === 0 ? (
                    <View style={styles.driverEmptyChip}>
                      <Text style={styles.driverEmptyText}>No drivers found</Text>
                    </View>
                  ) : (
                    sortedDrivers.map((driver) => (
                      <DriverMenuItem
                        key={driver.id}
                        driver={driver}
                        selected={driver.id === selectedDriverId}
                        onPress={() => {
                          setSelectedDriverId((current) => (current === driver.id ? null : driver.id));
                          setChannel('admin_driver');
                        }}
                      />
                    ))
                  )}
                </ScrollView>
                <View style={styles.driverPrivateActions}>
                  <View style={styles.driverPrivateStatus}>
                    <Text style={styles.driverPrivateStatusLabel}>Selected driver</Text>
                    <Text style={styles.driverPrivateStatusValue} numberOfLines={1}>
                      {selectedDriver ? selectedDriver.name : 'None selected'}
                    </Text>
                    <Text
                      style={[
                        styles.driverPrivateStatusMeta,
                        selectedDriver?.activeJobId ? styles.driverPrivateStatusOk : styles.driverPrivateStatusWarn,
                      ]}
                      numberOfLines={1}
                    >
                      {selectedDriver
                        ? selectedDriverBooking
                          ? `${selectedDriverBooking.active ? 'Active' : 'Latest'} booking #${selectedDriverBooking.ref ?? 'available'}`
                          : 'No booking available for private chat'
                        : 'Pick a driver from the menu'}
                    </Text>
                  </View>
                  <AppButton
                    label="Open Private Chat"
                    variant="primary"
                    onPress={() => { void openDriverConversation(); }}
                    loading={openingDriverChat}
                    disabled={!selectedDriverBooking || openingDriverChat}
                    style={styles.openDriverChatButton}
                  />
                </View>
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
                    <Text style={styles.muted}>
                      {selectedDriver
                        ? 'No private chats found for this driver yet.'
                        : 'Driver and customer chats will appear here.'}
                    </Text>
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
          <MessageActionsModal
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
          <EditMessageModal
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
        </KeyboardAvoidingView>
      </AdminModalShell>
    </Modal>
  );
}

function MessageActionsModal({
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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.actionBackdrop} onPress={onClose}>
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
    </Modal>
  );
}

function EditMessageModal({
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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.actionBackdrop}>
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
    </Modal>
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
}: {
  driver: DriverListItem;
  selected: boolean;
  onPress: () => void;
}) {
  const chatBooking = getDriverChatBooking(driver);
  const availableForPrivateChat = Boolean(chatBooking);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select driver ${driver.name}`}
      style={({ pressed }) => [
        styles.driverChip,
        selected && styles.driverChipSelected,
        !availableForPrivateChat && styles.driverChipMuted,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.driverChipTop}>
        <View
          style={[
            styles.driverStatusDot,
            driver.isOnline ? styles.driverStatusDotOnline : styles.driverStatusDotOffline,
          ]}
        />
        <Text style={[styles.driverChipName, selected && styles.driverChipNameSelected]} numberOfLines={1}>
          {driver.name}
        </Text>
      </View>
      <Text style={styles.driverChipMeta} numberOfLines={1}>
        {driver.status ?? (driver.isOnline ? 'online' : 'offline')}
      </Text>
      <Text
        style={[
          styles.driverChipJob,
          chatBooking?.active ? styles.driverChipJobActive : availableForPrivateChat ? styles.driverChipJobLatest : styles.driverChipJobMissing,
        ]}
        numberOfLines={1}
      >
        {chatBooking?.ref
          ? `${chatBooking.active ? 'Active' : 'Latest'} #${chatBooking.ref}`
          : 'No booking'}
      </Text>
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
  driverPrivateCard: {
    marginHorizontal: space.lg,
    marginTop: space.md,
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
  driverChip: {
    width: 156,
    minHeight: 88,
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
  deletedBody: { fontStyle: 'italic', opacity: 0.72 },
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
    flex: 1,
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
