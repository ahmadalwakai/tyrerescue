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
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/lib/api';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius, space } from './theme';
import { AdminModalHeader, AdminModalShell } from './layout/AdminModalShell';
import { uploadChatImageAttachment, type ChatLocalAsset } from '@/lib/chat-attachments';
import { saveChatAttachmentToDevice } from '@/lib/chat-download';
import { ChatComposerIconButton } from './ChatComposerIconButton';
import { ChatImageBubble } from './ChatImageBubble';
import { VoiceMessageBubble } from './VoiceMessageBubble';

type ChatRole = 'customer' | 'admin' | 'driver';
type MessageType = 'text' | 'image' | 'audio' | 'admin_note';
type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed';

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

const VOICE_UNAVAILABLE_MESSAGE =
  'Voice messages are temporarily disabled in this TestFlight build while the native audio crash is being fixed.';

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

export function DriverChatModal({ visible, bookingId, bookingRef, onClose }: Props) {
  const recorderState = { durationMillis: 0 };
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<MessageView | null>(null);
  const [editTarget, setEditTarget] = useState<MessageView | null>(null);
  const [editText, setEditText] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
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
    setActionTarget(null);
    setEditTarget(null);
    setEditText('');
    void openConversation();
  }, [openConversation, visible]);

  const updateMessage = useCallback((updated: MessageView) => {
    setMessages((items) => items.map((item) => (item.id === updated.id ? updated : item)));
  }, []);

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
    voiceBusy ||
    mediaBusy ||
    !conversationId ||
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
    if (!conversationId || mediaBusy || sending) return;
    setMediaBusy(true);
    setSending(true);
    setError(null);
    try {
      const attachment = await uploadChatImageAttachment(asset);
      const sent = await api.post<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
        { body: null, messageType: 'image', attachment },
      );
      setMessages((prev) => [...prev, sent]);
      markRead(conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send photo');
    } finally {
      setSending(false);
      setMediaBusy(false);
    }
  }, [conversationId, markRead, mediaBusy, sending]);

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
    if (!conversationId) return;
    setActionBusy(true);
    setError(null);
    try {
      const updated = await api.patch<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(message.id)}`,
        { action: 'delete' },
      );
      updateMessage(updated);
      setActionTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete message.');
    } finally {
      setActionBusy(false);
    }
  }, [conversationId, updateMessage]);

  const beginEditMessage = useCallback((message: MessageView) => {
    setEditTarget(message);
    setEditText(message.body ?? '');
    setActionTarget(null);
  }, []);

  const submitEditMessage = useCallback(async () => {
    const body = editText.trim();
    if (!conversationId || !editTarget || !body) return;
    setActionBusy(true);
    setError(null);
    try {
      const updated = await api.patch<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(editTarget.id)}`,
        { action: 'edit', body },
      );
      updateMessage(updated);
      setEditTarget(null);
      setEditText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not edit message.');
    } finally {
      setActionBusy(false);
    }
  }, [conversationId, editTarget, editText, updateMessage]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <AdminModalShell keyboardAvoidingEnabled={false}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'web' ? undefined : Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <AdminModalHeader
            title="Driver chat"
            subtitle={bookingRef ? `#${bookingRef}` : 'Current booking'}
            onClose={onClose}
          />

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
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
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
                const audioAttachment = getAudioAttachment(message);
                const imageAttachment = getImageAttachment(message);
                const deleted = isDeletedMessage(message);
                const mediaMessage = !deleted && Boolean(imageAttachment || audioAttachment);
                const bubbleStyle = [styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther];
                const bubbleContent = (
                  <>
                    <Text style={[styles.sender, mine ? styles.senderMine : styles.senderOther]}>
                      {mine ? 'Admin' : message.senderName || 'Driver'}
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
            {detail?.locked ? (
              <Text style={styles.inputHint}>This conversation is locked.</Text>
            ) : detail?.status === 'closed' || detail?.status === 'archived' ? (
              <Text style={styles.inputHint}>This conversation is closed.</Text>
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
                  placeholder="Message driver..."
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
                  style={styles.sendBtn}
                />
              </View>
            )}
          </View>
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
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  closeBtnText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '900' },
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
