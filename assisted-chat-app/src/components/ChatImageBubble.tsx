import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, radius, space } from './theme';
import { resolveChatAudioUri } from '@/lib/chat-attachments';

export function ChatImageBubble({
  uri,
  mine,
  onPreview,
  onLongPress,
}: {
  uri: string;
  mine: boolean;
  onPreview: (uri: string) => void;
  onLongPress?: () => void;
}) {
  const sourceUri = useMemo(() => resolveChatAudioUri(uri), [uri]);

  return (
    <Pressable
      onPress={() => onPreview(sourceUri)}
      onLongPress={onLongPress}
      delayLongPress={280}
      accessibilityRole="imagebutton"
      accessibilityLabel="Open chat photo"
      style={({ pressed }) => [
        styles.thumbButton,
        mine ? styles.thumbMine : styles.thumbOther,
        pressed && styles.pressed,
      ]}
    >
      <Image source={{ uri: sourceUri }} style={styles.thumbImage} resizeMode="cover" />
    </Pressable>
  );
}

/** The chat owns this overlay, so preview never presents a second iOS controller. */
export function ChatPhotoPreview({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  if (!uri) return null;
  return (
    <View style={styles.previewBackdrop} accessibilityViewIsModal>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close photo preview"
        style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
      >
        <Ionicons name="close" size={24} color={colors.text} />
      </Pressable>
      <Image source={{ uri }} style={styles.previewImage} resizeMode="contain" />
      <Text style={styles.previewHint}>Tap close to return to chat</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  thumbButton: {
    width: 228,
    maxWidth: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
  },
  thumbMine: { borderColor: 'rgba(9,9,11,0.18)' },
  thumbOther: { borderColor: colors.borderStrong },
  thumbImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.inputBg,
  },
  previewBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: 'rgba(1,3,10,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  closeButton: {
    position: 'absolute',
    top: space.xl,
    right: space.xl,
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  previewImage: {
    width: '100%',
    height: '82%',
  },
  previewHint: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '800',
    marginTop: space.md,
  },
  pressed: { opacity: 0.76 },
});
