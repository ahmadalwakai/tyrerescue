import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Image,
  Modal,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, radius } from '@/constants/theme';
import { chatApi, ChatMessage } from '@/api/client';
import { useAuth } from '@/auth/context';
import { LoadingScreen } from '@/components/LoadingScreen';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { lightHaptic } from '@/services/haptics';
import { useI18n } from '@/i18n';
import { saveChatAttachmentToDevice } from '@/lib/chat-download';

const VOICE_BARS = [12, 20, 15, 28, 18, 34, 22, 16, 30, 20, 13, 24, 17, 31];
const VOICE_MIME_TYPE = Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4';
const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function makeVoiceFileName(): string {
  return `driver-voice-${Date.now()}.${Platform.OS === 'web' ? 'webm' : 'm4a'}`;
}

function formatAudioTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatRecordingTime(ms: number): string {
  return formatAudioTime(ms / 1000);
}

function getAudioAttachment(message: ChatMessage): NonNullable<ChatMessage['attachments']>[number] | null {
  return message.attachments?.find((attachment) => !attachment.deleted && attachment.mimeType.startsWith('audio/')) ?? null;
}

function getImageAttachment(message: ChatMessage): NonNullable<ChatMessage['attachments']>[number] | null {
  return message.attachments?.find((attachment) => !attachment.deleted && attachment.mimeType.startsWith('image/')) ?? null;
}

function isDeletedMessage(message: ChatMessage): boolean {
  return Boolean(message.deleted || (!message.body && !getAudioAttachment(message) && !getImageAttachment(message)));
}

function normalizeImageMimeType(asset: ImagePicker.ImagePickerAsset): string {
  const mimeType = asset.mimeType?.split(';')[0]?.trim().toLowerCase();
  if (mimeType && IMAGE_EXTENSION_BY_MIME[mimeType]) return mimeType;

  const name = asset.fileName ?? asset.uri;
  const extension = name.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function makeImageFileName(asset: ImagePicker.ImagePickerAsset, mimeType: string): string {
  const extension = IMAGE_EXTENSION_BY_MIME[mimeType] ?? 'jpg';
  if (asset.fileName && /\.[a-z0-9]+$/i.test(asset.fileName)) return asset.fileName;
  return `driver-photo-${Date.now()}.${extension}`;
}

function PhotoMessage({ uri, onLongPress }: { uri: string; onLongPress?: () => void }) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <>
      <AnimatedPressable
        style={styles.photoThumbButton}
        onPress={() => {
          lightHaptic();
          setPreviewOpen(true);
        }}
        onLongPress={onLongPress}
        delayLongPress={280}
        pressScale={0.97}
      >
        <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
      </AnimatedPressable>
      <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
        <View style={styles.photoPreviewBackdrop}>
          <AnimatedPressable
            style={styles.photoPreviewClose}
            onPress={() => {
              lightHaptic();
              setPreviewOpen(false);
            }}
            pressScale={0.9}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </AnimatedPressable>
          <Image source={{ uri }} style={styles.photoPreviewImage} resizeMode="contain" />
        </View>
      </Modal>
    </>
  );
}

function VoiceMessage({ uri, isMe, onLongPress }: { uri: string; isMe: boolean; onLongPress?: () => void }) {
  const player = useAudioPlayer({ uri }, { updateInterval: 250, downloadFirst: true });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || 0;
  const current = status.currentTime || 0;
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPressTimer = useCallback(() => {
    if (!longPressTimerRef.current) return;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const startLongPressTimer = useCallback(() => {
    clearLongPressTimer();
    if (!onLongPress) return;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      onLongPress();
    }, 280);
  }, [clearLongPressTimer, onLongPress]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    player.seekTo(0).catch(() => undefined);
  }, [player, status.didJustFinish]);

  useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

  const togglePlayback = () => {
    lightHaptic();
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish) {
      player.seekTo(0).catch(() => undefined);
    }
    player.play();
  };

  return (
    <View
      style={styles.voiceWrap}
      onTouchStart={startLongPressTimer}
      onTouchEnd={clearLongPressTimer}
      onTouchCancel={clearLongPressTimer}
    >
      <AnimatedPressable
        style={[styles.voicePlayButton, isMe ? styles.voicePlayButtonMe : styles.voicePlayButtonThem]}
        onPress={togglePlayback}
        pressScale={0.9}
      >
        <Ionicons name={status.playing ? 'pause' : 'play'} size={16} color={isMe ? colors.bg : colors.accent} />
      </AnimatedPressable>
      <View style={styles.voiceContent}>
        <View style={styles.waveform}>
          {VOICE_BARS.map((height, index) => {
            const active = index / Math.max(1, VOICE_BARS.length - 1) <= progress;
            return (
              <View
                key={`${height}-${index}`}
                style={[
                  styles.voiceBar,
                  { height },
                  isMe ? styles.voiceBarMe : styles.voiceBarThem,
                  active && (isMe ? styles.voiceBarMeActive : styles.voiceBarThemActive),
                ]}
              />
            );
          })}
        </View>
        <Text style={[styles.voiceTime, isMe ? styles.voiceTimeMe : styles.voiceTimeThem]}>
          {formatAudioTime(status.playing || current > 0 ? current : duration)}
        </Text>
      </View>
    </View>
  );
}

export default function ChatConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t, dateLocale } = useI18n();
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<ChatMessage | null>(null);
  const [editTarget, setEditTarget] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendingRef = useRef(false);
  const recordingActive = recorderState.isRecording || recorder.isRecording;
  const recordingComposerActive = recordingActive || (voiceBusy && sending);

  const fetchMessages = useCallback(async () => {
    if (!id) return;
    try {
      const res = await chatApi.getMessages(id);
      setMessages(res.messages);
      await chatApi.markRead(id);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMessages();
    // Poll every 10 seconds for new messages
    pollRef.current = setInterval(fetchMessages, 10_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMessages]);

  useEffect(() => {
    setActionTarget(null);
    setEditTarget(null);
    setEditText('');
  }, [id]);

  useEffect(() => {
    return () => {
      if (recorder.isRecording) {
        recorder.stop().catch(() => undefined);
        setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      }
    };
  }, [recorder]);

  const updateMessage = useCallback((updated: ChatMessage) => {
    setMessages((prev) => prev.map((message) => (message.id === updated.id ? updated : message)));
  }, []);

  const handleSaveMessageAttachment = useCallback(async () => {
    if (!actionTarget) return;
    const attachment = getImageAttachment(actionTarget) ?? getAudioAttachment(actionTarget);
    if (!attachment) return;
    lightHaptic();
    setActionBusy(true);
    setVoiceError(null);
    try {
      await saveChatAttachmentToDevice({
        url: attachment.url,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
      });
      setActionTarget(null);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Could not save attachment.');
    } finally {
      setActionBusy(false);
    }
  }, [actionTarget]);

  const handleDeleteMessage = useCallback(async () => {
    if (!id || !actionTarget) return;
    lightHaptic();
    setActionBusy(true);
    setVoiceError(null);
    try {
      const updated = await chatApi.deleteMessage(id, actionTarget.id);
      updateMessage(updated);
      setActionTarget(null);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Could not delete message.');
    } finally {
      setActionBusy(false);
    }
  }, [actionTarget, id, updateMessage]);

  const beginEditMessage = useCallback(() => {
    if (!actionTarget?.body) return;
    lightHaptic();
    setEditTarget(actionTarget);
    setEditText(actionTarget.body);
    setActionTarget(null);
  }, [actionTarget]);

  const submitEditMessage = useCallback(async () => {
    if (!id || !editTarget || !editText.trim()) return;
    lightHaptic();
    setActionBusy(true);
    setVoiceError(null);
    try {
      const updated = await chatApi.updateMessage(id, editTarget.id, editText.trim());
      updateMessage(updated);
      setEditTarget(null);
      setEditText('');
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Could not edit message.');
    } finally {
      setActionBusy(false);
    }
  }, [editTarget, editText, id, updateMessage]);

  const handleSend = async () => {
    if (!text.trim() || !id || sendingRef.current) return;
    sendingRef.current = true;
    lightHaptic();
    setSending(true);
    setVoiceError(null);
    try {
      const msg = await chatApi.sendMessage(id, text.trim());
      setMessages((prev) => [...prev, msg]);
      setText('');
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      // Ignore
    }
    setSending(false);
    sendingRef.current = false;
  };

  const startVoiceRecording = async () => {
    if (!id || sendingRef.current || voiceBusy || recordingActive) return;
    lightHaptic();
    setVoiceBusy(true);
    setVoiceError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setVoiceError('Microphone permission is required to send a voice message.');
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setVoiceError('Could not start voice recording.');
    } finally {
      setVoiceBusy(false);
    }
  };

  const cancelVoiceRecording = async () => {
    if (!recordingActive || voiceBusy) return;
    lightHaptic();
    setVoiceBusy(true);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      // Ignore cancellation errors.
    } finally {
      setVoiceBusy(false);
    }
  };

  const sendVoiceRecording = async () => {
    if (!id || !recordingActive || sendingRef.current || voiceBusy) return;
    sendingRef.current = true;
    lightHaptic();
    setSending(true);
    setVoiceBusy(true);
    setVoiceError(null);
    try {
      const durationMillis = recorderState.durationMillis;
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const status = recorder.getStatus();
      const uri = recorder.uri ?? status.url ?? recorderState.url;
      if (!uri) throw new Error('No voice recording was created.');
      if (durationMillis > 0 && durationMillis < 650) {
        throw new Error('Voice message is too short.');
      }

      const attachment = await chatApi.uploadAttachment(uri, VOICE_MIME_TYPE, makeVoiceFileName());
      const msg = await chatApi.sendVoiceMessage(id, attachment);
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Could not send voice message.');
    } finally {
      setSending(false);
      setVoiceBusy(false);
      sendingRef.current = false;
    }
  };

  const sendImageAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!id || sendingRef.current || mediaBusy) return;
    const mimeType = normalizeImageMimeType(asset);
    sendingRef.current = true;
    lightHaptic();
    setSending(true);
    setMediaBusy(true);
    setVoiceError(null);
    try {
      const attachment = await chatApi.uploadAttachment(
        asset.uri,
        mimeType,
        makeImageFileName(asset, mimeType),
        asset.file,
      );
      const msg = await chatApi.sendImageMessage(id, attachment);
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Could not send photo.');
    } finally {
      setSending(false);
      setMediaBusy(false);
      sendingRef.current = false;
    }
  };

  const pickImageFromLibrary = async () => {
    if (!id || sendingRef.current || mediaBusy) return;
    lightHaptic();
    setVoiceError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setVoiceError('Photo library permission is required to send an image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.82,
      });
      if (result.canceled || !result.assets[0]) return;
      await sendImageAsset(result.assets[0]);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Could not open photo library.');
    }
  };

  const takeCameraPhoto = async () => {
    if (!id || sendingRef.current || mediaBusy) return;
    lightHaptic();
    setVoiceError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setVoiceError('Camera permission is required to send a photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.82,
        cameraType: ImagePicker.CameraType.back,
      });
      if (result.canceled || !result.assets[0]) return;
      await sendImageAsset(result.assets[0]);
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Could not open camera.');
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        data={messages}
        keyExtractor={(item) => item.id}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const isMe = item.senderId === user?.id;
          const audioAttachment = getAudioAttachment(item);
          const imageAttachment = getImageAttachment(item);
          const deleted = isDeletedMessage(item);
          const mediaMessage = !deleted && Boolean(imageAttachment || audioAttachment);
          const bubbleStyle = [styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem];
          const bubbleContent = (
            <>
              {!isMe && (
                <Text style={styles.senderName}>
                  {item.senderName} · {item.senderRole}
                </Text>
              )}
              {deleted ? (
                <Text style={[styles.bubbleText, styles.deletedText]}>Message deleted</Text>
              ) : imageAttachment ? (
                <PhotoMessage
                  uri={imageAttachment.url}
                  onLongPress={() => {
                    lightHaptic();
                    setActionTarget(item);
                  }}
                />
              ) : audioAttachment ? (
                <VoiceMessage
                  uri={audioAttachment.url}
                  isMe={isMe}
                  onLongPress={() => {
                    lightHaptic();
                    setActionTarget(item);
                  }}
                />
              ) : item.body ? (
                <Text style={styles.bubbleText}>{item.body}</Text>
              ) : (
                <Text style={styles.bubbleText}>Attachment</Text>
              )}
              <Text style={styles.bubbleTime}>
                {format(new Date(item.createdAt), 'HH:mm', { locale: dateLocale })}
              </Text>
            </>
          );
          return (
            mediaMessage ? (
              <View style={bubbleStyle}>{bubbleContent}</View>
            ) : (
              <AnimatedPressable
                style={bubbleStyle}
                onLongPress={() => {
                  lightHaptic();
                  setActionTarget(item);
                }}
                delayLongPress={280}
                pressScale={0.995}
                accessibilityRole="button"
                accessibilityLabel="Open message tools"
              >
                {bubbleContent}
              </AnimatedPressable>
            )
          );
        }}
      />

      {/* Input */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        {voiceError ? <Text style={styles.voiceError}>{voiceError}</Text> : null}
        {recordingComposerActive ? (
          <View style={styles.recordingRow}>
            <View style={styles.recordingPill}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>
                Recording {formatRecordingTime(recorderState.durationMillis)}
              </Text>
            </View>
            <AnimatedPressable
              style={[styles.recordingButton, styles.recordingCancelButton]}
              onPress={cancelVoiceRecording}
              disabled={voiceBusy}
              pressScale={0.9}
            >
              <Ionicons name="close" size={20} color={colors.white} />
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.recordingButton, styles.recordingSendButton, voiceBusy && styles.sendDisabled]}
              onPress={sendVoiceRecording}
              disabled={voiceBusy}
              pressScale={0.9}
            >
              {voiceBusy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Ionicons name="send" size={20} color={colors.white} />
              )}
            </AnimatedPressable>
          </View>
        ) : (
          <View style={styles.composerRow}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={t('chat.typeMessage')}
              placeholderTextColor={colors.muted}
              editable={!sending && !voiceBusy && !mediaBusy}
              multiline
              maxLength={5000}
            />
            <AnimatedPressable
              style={[styles.mediaButton, (sending || voiceBusy || mediaBusy) && styles.sendDisabled]}
              onPress={pickImageFromLibrary}
              disabled={sending || voiceBusy || mediaBusy}
              pressScale={0.9}
            >
              <Ionicons name="image-outline" size={19} color={colors.text} />
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.mediaButton, (sending || voiceBusy || mediaBusy) && styles.sendDisabled]}
              onPress={takeCameraPhoto}
              disabled={sending || voiceBusy || mediaBusy}
              pressScale={0.9}
            >
              <Ionicons name="camera-outline" size={19} color={colors.text} />
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.sendButton, (sending || voiceBusy || mediaBusy) && styles.sendDisabled]}
              onPress={text.trim() ? handleSend : startVoiceRecording}
              disabled={sending || voiceBusy || mediaBusy}
              pressScale={0.9}
            >
              {mediaBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons name={text.trim() ? 'send' : 'mic'} size={20} color="#FFFFFF" />
              )}
            </AnimatedPressable>
          </View>
        )}
      </View>
      <MessageActionsModal
        visible={Boolean(actionTarget)}
        message={actionTarget}
        busy={actionBusy}
        canSave={Boolean(actionTarget && !isDeletedMessage(actionTarget) && (getImageAttachment(actionTarget) || getAudioAttachment(actionTarget)))}
        canEdit={Boolean(
          actionTarget &&
            !isDeletedMessage(actionTarget) &&
            actionTarget.senderId === user?.id &&
            actionTarget.body &&
            (actionTarget.messageType === 'text' || actionTarget.messageType === 'admin_note'),
        )}
        canDelete={Boolean(actionTarget && !isDeletedMessage(actionTarget) && actionTarget.senderId === user?.id)}
        onClose={() => {
          if (!actionBusy) setActionTarget(null);
        }}
        onSave={handleSaveMessageAttachment}
        onEdit={beginEditMessage}
        onDelete={handleDeleteMessage}
      />
      <EditMessageModal
        visible={Boolean(editTarget)}
        value={editText}
        busy={actionBusy}
        onChangeText={setEditText}
        onCancel={() => {
          if (!actionBusy) {
            setEditTarget(null);
            setEditText('');
          }
        }}
        onSave={submitEditMessage}
      />
    </KeyboardAvoidingView>
  );
}

function MessageActionsModal({
  visible,
  message,
  busy,
  canSave,
  canEdit,
  canDelete,
  onClose,
  onSave,
  onEdit,
  onDelete,
}: {
  visible: boolean;
  message: ChatMessage | null;
  busy: boolean;
  canSave: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const label = message?.messageType === 'audio' ? 'Voice message' : message?.messageType === 'image' ? 'Photo' : 'Chat message';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.actionBackdrop} onPress={onClose}>
        <Pressable style={styles.actionSheet}>
          <View style={styles.actionHandle} />
          <Text style={styles.actionTitle}>Message tools</Text>
          <Text style={styles.actionSubtitle} numberOfLines={1}>
            {label}
          </Text>
          {canSave ? <ActionSheetButton label="Save" icon="download-outline" disabled={busy} onPress={onSave} /> : null}
          {canEdit ? <ActionSheetButton label="Edit" icon="create-outline" disabled={busy} onPress={onEdit} /> : null}
          {canDelete ? <ActionSheetButton label="Delete" icon="trash-outline" danger disabled={busy} onPress={onDelete} /> : null}
          <ActionSheetButton label="Cancel" icon="close" disabled={busy} onPress={onClose} />
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
            placeholderTextColor={colors.muted}
            style={styles.editInput}
            multiline
            maxLength={5000}
          />
          <View style={styles.editActions}>
            <ActionSheetButton label="Cancel" icon="close" disabled={busy} onPress={onCancel} />
            <ActionSheetButton label="Save" icon="checkmark" disabled={busy || !value.trim()} onPress={onSave} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ActionSheetButton({
  label,
  icon,
  danger,
  disabled,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
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
      <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.text} />
      <Text style={[styles.actionButtonText, danger && styles.actionButtonTextDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
  },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  senderName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: colors.muted,
    marginBottom: 2,
    textTransform: 'capitalize',
  },
  bubbleText: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.base,
    color: colors.text,
  },
  deletedText: {
    fontStyle: 'italic',
    opacity: 0.68,
  },
  bubbleTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  photoThumbButton: {
    width: 228,
    maxWidth: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: colors.surface,
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
  photoPreviewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(1,3,10,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  photoPreviewClose: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.xl,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  photoPreviewImage: {
    width: '100%',
    height: '84%',
  },
  voiceWrap: {
    minWidth: 210,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  voicePlayButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  voicePlayButtonMe: {
    backgroundColor: 'rgba(9,9,11,0.18)',
    borderColor: 'rgba(9,9,11,0.22)',
  },
  voicePlayButtonThem: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  voiceContent: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  waveform: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  voiceBar: {
    width: 3,
    borderRadius: 2,
    opacity: 0.42,
  },
  voiceBarMe: { backgroundColor: 'rgba(9,9,11,0.72)' },
  voiceBarThem: { backgroundColor: colors.muted },
  voiceBarMeActive: { opacity: 1, backgroundColor: colors.bg },
  voiceBarThemActive: { opacity: 1, backgroundColor: colors.accent },
  voiceTime: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
  },
  voiceTimeMe: { color: 'rgba(9,9,11,0.7)' },
  voiceTimeThem: { color: colors.muted },
  inputBar: {
    alignItems: 'stretch',
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.base,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendDisabled: {
    opacity: 0.4,
  },
  voiceError: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    color: colors.danger,
    paddingHorizontal: spacing.xs,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  recordingPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.46)',
    backgroundColor: 'rgba(239,68,68,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
  },
  recordingText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  recordingButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingCancelButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recordingSendButton: {
    backgroundColor: colors.accent,
  },
  actionBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(9,9,11,0.72)',
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  actionSheet: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  actionHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
  actionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.lg,
    color: colors.text,
  },
  actionSubtitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  actionButton: {
    minHeight: 48,
    minWidth: 112,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  actionButtonDanger: {
    borderColor: 'rgba(239,68,68,0.48)',
    backgroundColor: 'rgba(239,68,68,0.14)',
  },
  actionButtonDisabled: {
    opacity: 0.46,
  },
  actionButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.base,
    color: colors.text,
  },
  actionButtonTextDanger: {
    color: colors.danger,
  },
  editInput: {
    minHeight: 96,
    maxHeight: 180,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.base,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  pressed: {
    opacity: 0.78,
  },
});
