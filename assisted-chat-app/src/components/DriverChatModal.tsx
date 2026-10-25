import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { api, getAdminToken, getApiContextRevision } from '@/lib/api';
import { getAdminSessionRevision } from '@/hooks/useAdminSession';
import { useChatSounds } from '@/hooks/useChatSounds';
import { useChatVoiceRecorder } from '@/hooks/useChatVoiceRecorder';
import { chatMessageDisplayText } from '@/lib/chat-message-display';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius, space } from './theme';
import { ChatScreenLayout, useChatBottomPadding } from './chat/ChatScreenLayout';
import { uploadChatImageAttachment, uploadChatVoiceAttachment, type ChatLocalAsset } from '@/lib/chat-attachments';
import { saveChatAttachmentToDevice } from '@/lib/chat-download';
import { ChatComposerIconButton } from './ChatComposerIconButton';
import { ChatImageBubble, ChatPhotoPreview } from './ChatImageBubble';
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
  onDismiss?: () => void;
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

export function DriverChatModal({ visible, bookingId, bookingRef, onClose, onDismiss }: Props) {
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
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const sendRequestRef = useRef<object | null>(null);
  const messageFetchRef = useRef(0);
  const acceptedMessagesRef = useRef<{ id: string; messages: MessageView[] } | null>(null);
  const bottomPadding = useChatBottomPadding();
  const scopeKey = `${getAdminSessionRevision()}:${getApiContextRevision()}:${bookingId ?? ''}`;
  const scopeRef = useRef({ visible, scopeKey, generation: 0, conversationId: null as string | null });
  if (scopeRef.current.visible !== visible || scopeRef.current.scopeKey !== scopeKey) {
    scopeRef.current = { visible, scopeKey, generation: scopeRef.current.generation + 1, conversationId: null };
  }
  const { observeMessages, playSent } = useChatSounds({ visible, conversationId, scopeKey });
  const captureScope = useCallback(() => ({ ...scopeRef.current, token: getAdminToken(), apiRevision: getApiContextRevision(), sessionRevision: getAdminSessionRevision() }), []);
  const isCurrent = useCallback((scope: ReturnType<typeof captureScope>, id?: string) => (
    scopeRef.current.visible && scope.visible && scope.scopeKey === scopeRef.current.scopeKey &&
    scope.generation === scopeRef.current.generation && scope.token === getAdminToken() &&
    scope.apiRevision === getApiContextRevision() && scope.sessionRevision === getAdminSessionRevision() &&
    (!id || scopeRef.current.conversationId === id)
  ), []);

  const { state: recorderState, start: startRecording, finish: finishRecording, cancel: cancelRecording, getState: getRecordingState } = useChatVoiceRecorder({ visible, conversationId: conversationId, scopeKey });
  const closeChat = useCallback(() => {
    setPreviewUri(null);
    void cancelRecording();
    scopeRef.current.visible = false;
    scopeRef.current.generation += 1;
    sendRequestRef.current = null;
    messageFetchRef.current += 1;
    onClose();
  }, [onClose, cancelRecording]);

  const markRead = useCallback((id: string) => {
    api.post(`/api/chat/conversations/${encodeURIComponent(id)}/read`).catch(() => undefined);
  }, []);

  const fetchMessages = useCallback(async (id: string) => {
    const scope = captureScope();
    const request = ++messageFetchRef.current;
    const data = await api.get<MessagesResponse>(
      `/api/chat/conversations/${encodeURIComponent(id)}/messages?limit=50`,
    );
    if (!isCurrent(scope, id) || request !== messageFetchRef.current) return;
    acceptedMessagesRef.current = { id: id, messages: data.messages ?? [] };
    setMessages(data.messages ?? []);
    observeMessages(data.messages ?? [], id);
    markRead(id);
  }, [captureScope, isCurrent, markRead, observeMessages]);

  // A fast response can finish before the new chat's layout effect installs its sound scope.
  // Replay only the accepted snapshot after commit; the tracker suppresses duplicate observations.
  useEffect(() => {
    const snapshot = acceptedMessagesRef.current;
    if (visible && !loading && snapshot && snapshot.id === conversationId) observeMessages(snapshot.messages, snapshot.id);
  }, [conversationId, loading, messages, observeMessages, visible]);

  const openConversation = useCallback(async () => {
    if (!bookingId || !scopeRef.current.visible) return;
    const scope = captureScope();
    setLoading(true);
    setError(null);
    try {
      const created = await api.post<CreateConversationResponse>('/api/chat/conversations', {
        bookingId,
        channel: 'admin_driver',
      });
      if (!isCurrent(scope)) return;
      scopeRef.current.conversationId = created.conversationId;
      setConversationId(created.conversationId);
      const [nextDetail] = await Promise.all([
        api.get<ConversationDetail>(
          `/api/chat/conversations/${encodeURIComponent(created.conversationId)}`,
        ),
        fetchMessages(created.conversationId),
      ]);
      if (isCurrent(scope, created.conversationId)) setDetail(nextDetail);
    } catch (err) {
      if (!isCurrent(scope)) return;
      const msg = err instanceof Error ? err.message : 'Could not open driver chat';
      setError(
        msg.includes('No driver assigned') || msg.toLowerCase().includes('driver')
          ? 'Assign a driver first, then open chat.'
          : msg,
      );
    } finally {
      if (isCurrent(scope)) setLoading(false);
    }
  }, [bookingId, captureScope, fetchMessages, isCurrent]);

  useLayoutEffect(() => {
    scopeRef.current.visible = visible;
    void cancelRecording();
    scopeRef.current.generation += 1;
    sendRequestRef.current = null; messageFetchRef.current += 1;
    scopeRef.current.conversationId = null;
    acceptedMessagesRef.current = null;
    setPreviewUri(null);
    setSending(false); setMediaBusy(false); setVoiceBusy(false); setActionBusy(false);
    setConversationId(null);
    setDetail(null);
    setMessages([]);
    setText('');
    setActionTarget(null);
    setEditTarget(null);
    setEditText('');
    if (!visible) return;
    void openConversation();
    return () => { scopeRef.current.visible = false; scopeRef.current.generation += 1; };
  }, [cancelRecording, openConversation, scopeKey, visible]);

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
    if (!conversationId || !body || sending || sendRequestRef.current || getRecordingState().phase !== 'idle') return;
    const scope = captureScope();
    if (!isCurrent(scope, conversationId)) return;
    const request = {};
    sendRequestRef.current = request;
    setSending(true);
    setError(null);
    try {
      const sent = await api.post<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
        { body, messageType: 'text' },
      );
      if (!isCurrent(scope, conversationId)) return;
      messageFetchRef.current += 1;
      setMessages((prev) => prev.some((item) => item.id === sent.id) ? prev : [...prev, sent]);
      playSent(sent.id);
      setText('');
      markRead(conversationId);
    } catch (err) {
      if (isCurrent(scope, conversationId)) setError(err instanceof Error ? err.message : 'Could not send message');
    } finally {
      if (sendRequestRef.current === request) sendRequestRef.current = null;
      if (isCurrent(scope, conversationId)) setSending(false);
    }
  }, [captureScope, conversationId, getRecordingState, isCurrent, markRead, playSent, sending, text]);

  const inputDisabled =
    loading ||
    sending ||
    voiceBusy ||
    recorderState.phase !== 'idle' ||
    mediaBusy ||
    !conversationId ||
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
    if (!conversationId || voiceBusy || sending || sendRequestRef.current) return;
    const scope = captureScope();
    if (!isCurrent(scope, conversationId)) return;
    const request = {};
    sendRequestRef.current = request;
    setVoiceBusy(true);
    setError(null);
    try {
      const uri = await finishRecording();
      if (!uri || !isCurrent(scope, conversationId)) return;
      const attachment = await uploadChatVoiceAttachment(uri);
      if (!isCurrent(scope, conversationId) || getRecordingState().phase !== 'ready') return;
      const sent = await api.post<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
        { body: null, messageType: 'audio', attachment },
      );
      if (!isCurrent(scope, conversationId)) return;
      messageFetchRef.current += 1;
      setMessages((items) => items.some((item) => item.id === sent.id) ? items : [...items, sent]);
      playSent(sent.id);
      markRead(conversationId);
      await cancelRecording();
    } catch (err) {
      if (isCurrent(scope, conversationId)) setError(err instanceof Error ? err.message : 'Could not send voice message. Tap Send voice to retry.');
    } finally {
      if (sendRequestRef.current === request) sendRequestRef.current = null;
      if (isCurrent(scope, conversationId)) setVoiceBusy(false);
    }
  }, [captureScope, getRecordingState, isCurrent, markRead, playSent, conversationId, sending, voiceBusy, cancelRecording, finishRecording]);

  const sendImageAsset = useCallback(async (asset: ChatLocalAsset) => {
    if (!conversationId || mediaBusy || sending || sendRequestRef.current || getRecordingState().phase !== 'idle') return;
    const scope = captureScope();
    if (!isCurrent(scope, conversationId)) return;
    const request = {};
    sendRequestRef.current = request;
    setMediaBusy(true);
    setSending(true);
    setError(null);
    try {
      const attachment = await uploadChatImageAttachment(asset);
      if (!isCurrent(scope, conversationId)) return;
      const sent = await api.post<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
        { body: null, messageType: 'image', attachment },
      );
      if (!isCurrent(scope, conversationId)) return;
      messageFetchRef.current += 1;
      setMessages((prev) => prev.some((item) => item.id === sent.id) ? prev : [...prev, sent]);
      playSent(sent.id);
      markRead(conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send photo');
    } finally {
      if (sendRequestRef.current === request) sendRequestRef.current = null;
      if (isCurrent(scope, conversationId)) { setSending(false); setMediaBusy(false); }
    }
  }, [captureScope, conversationId, getRecordingState, isCurrent, markRead, mediaBusy, playSent, sending]);

  const pickImageFromLibrary = useCallback(async () => {
    if (inputDisabled || !conversationId) return;
    const scope = captureScope();
    if (!isCurrent(scope, conversationId)) return;
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!isCurrent(scope, conversationId)) return;
      if (!permission.granted) {
        setError('Photo library permission is required to send an image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.82,
      });
      if (!isCurrent(scope, conversationId) || result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await sendImageAsset({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        file: asset.file,
      });
    } catch (err) {
      if (isCurrent(scope, conversationId)) setError(err instanceof Error ? err.message : 'Could not open photo library.');
    }
  }, [captureScope, conversationId, inputDisabled, isCurrent, sendImageAsset]);

  const takeCameraPhoto = useCallback(async () => {
    if (inputDisabled || !conversationId) return;
    const scope = captureScope();
    if (!isCurrent(scope, conversationId)) return;
    setError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!isCurrent(scope, conversationId)) return;
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
      if (!isCurrent(scope, conversationId) || result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await sendImageAsset({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        file: asset.file,
      });
    } catch (err) {
      if (isCurrent(scope, conversationId)) setError(err instanceof Error ? err.message : 'Could not open camera.');
    }
  }, [captureScope, conversationId, inputDisabled, isCurrent, sendImageAsset]);

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
    if (!conversationId) return;
    const scope = captureScope();
    if (!isCurrent(scope, conversationId)) return;
    setActionBusy(true);
    setError(null);
    try {
      const updated = await api.patch<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(message.id)}`,
        { action: 'delete' },
      );
      if (!isCurrent(scope, conversationId)) return;
      messageFetchRef.current += 1;
      updateMessage(updated);
      setActionTarget(null);
    } catch (err) {
      if (isCurrent(scope, conversationId)) setError(err instanceof Error ? err.message : 'Could not delete message.');
    } finally {
      if (isCurrent(scope, conversationId)) setActionBusy(false);
    }
  }, [captureScope, isCurrent, conversationId, updateMessage]);

  const beginEditMessage = useCallback((message: MessageView) => {
    setEditTarget(message);
    setEditText(message.body ?? '');
    setActionTarget(null);
  }, []);

  const submitEditMessage = useCallback(async () => {
    const body = editText.trim();
    if (!conversationId || !editTarget || !body) return;
    const scope = captureScope();
    if (!isCurrent(scope, conversationId)) return;
    setActionBusy(true);
    setError(null);
    try {
      const updated = await api.patch<MessageView>(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(editTarget.id)}`,
        { action: 'edit', body },
      );
      if (!isCurrent(scope, conversationId)) return;
      messageFetchRef.current += 1;
      updateMessage(updated);
      setEditTarget(null);
      setEditText('');
    } catch (err) {
      if (isCurrent(scope, conversationId)) setError(err instanceof Error ? err.message : 'Could not edit message.');
    } finally {
      if (isCurrent(scope, conversationId)) setActionBusy(false);
    }
  }, [captureScope, isCurrent, conversationId, editTarget, editText, updateMessage]);

  return (
    <Modal visible={visible} presentationStyle="fullScreen" animationType="slide" onRequestClose={() => {
      if (previewUri) setPreviewUri(null);
      else if (editTarget) { setEditTarget(null); setEditText(''); }
      else if (actionTarget) setActionTarget(null);
      else closeChat();
    }} onDismiss={onDismiss}>
      <ChatScreenLayout title="Driver chat" subtitle="Private admin / driver conversation"
        reference={bookingRef ? `#${bookingRef}` : null} onClose={closeChat}>
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

          <View style={[styles.composer, { paddingBottom: bottomPadding }]}>
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
                  placeholder="Message driver..."
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
                  style={styles.sendBtn}
                />
                </View>
              </View>
            )}
          </View>
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
  messages: { flex: 1, minHeight: 0, backgroundColor: '#000000' },
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
  body: { fontSize: fontSize.md, lineHeight: 23, textAlign: 'auto', writingDirection: 'auto', flexShrink: 1 },
  bodyMine: { color: colors.accentText },
  bodyOther: { color: colors.text },
  deletedBody: { fontStyle: 'italic', opacity: 0.72 },
  time: { fontSize: 10, marginTop: 2, textAlign: 'right' },
  timeMine: { color: 'rgba(9,9,11,0.72)' },
  timeOther: { color: colors.subtle },
  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#000000',
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    gap: space.xs,
  },
  inputHint: { color: colors.warning, fontSize: fontSize.xs, fontWeight: '700' },
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
  sendBtn: { flex: 1, minWidth: 84, minHeight: 48 },
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
