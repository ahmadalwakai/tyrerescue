import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, space } from './theme';
import { resolveChatAudioUri } from '@/lib/chat-attachments';

const VOICE_BARS = [12, 20, 15, 28, 18, 34, 22, 16, 30, 20, 13, 24, 17, 31, 19, 14];

function formatAudioTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function VoiceMessageBubble({
  uri,
  mine,
  onLongPress,
}: {
  uri: string;
  mine: boolean;
  onLongPress?: () => void;
}) {
  const sourceUri = useMemo(() => resolveChatAudioUri(uri), [uri]);
  const [opening, setOpening] = useState(false);
  const progress = 0;
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

  const togglePlayback = useCallback(async () => {
    if (opening) return;
    setOpening(true);
    try {
      await Linking.openURL(sourceUri);
    } catch {
      // Playback is best-effort in this crash-safe TestFlight path.
    } finally {
      setOpening(false);
    }
  }, [opening, sourceUri]);

  useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

  return (
    <View
      onTouchStart={startLongPressTimer}
      onTouchEnd={clearLongPressTimer}
      onTouchCancel={clearLongPressTimer}
      style={styles.wrap}
    >
      <Pressable
        onPress={togglePlayback}
        accessibilityRole="button"
        accessibilityLabel="Open voice message"
        style={({ pressed }) => [
          styles.playButton,
          mine ? styles.playButtonMine : styles.playButtonOther,
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.playIcon, mine ? styles.playIconMine : styles.playIconOther]}>
          {opening ? '...' : '>'}
        </Text>
      </Pressable>
      <View style={styles.voiceContent}>
        <View style={styles.waveform} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {VOICE_BARS.map((height, index) => {
            const active = index / Math.max(1, VOICE_BARS.length - 1) <= progress;
            return (
              <View
                key={`${height}-${index}`}
                style={[
                  styles.voiceBar,
                  { height },
                  mine ? styles.voiceBarMine : styles.voiceBarOther,
                  active && (mine ? styles.voiceBarMineActive : styles.voiceBarOtherActive),
                ]}
              />
            );
          })}
        </View>
        <Text style={[styles.duration, mine ? styles.durationMine : styles.durationOther]}>
          {formatAudioTime(0)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minWidth: 210,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingTop: 2,
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  playButtonMine: {
    backgroundColor: 'rgba(9,9,11,0.16)',
    borderColor: 'rgba(9,9,11,0.22)',
  },
  playButtonOther: {
    backgroundColor: colors.inputBg,
    borderColor: colors.borderStrong,
  },
  playIcon: {
    fontSize: fontSize.md,
    fontWeight: '900',
    marginLeft: 1,
  },
  playIconMine: { color: colors.accentText },
  playIconOther: { color: colors.accent },
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
  voiceBarMine: { backgroundColor: 'rgba(9,9,11,0.72)' },
  voiceBarOther: { backgroundColor: colors.subtle },
  voiceBarMineActive: { opacity: 1, backgroundColor: colors.accentText },
  voiceBarOtherActive: { opacity: 1, backgroundColor: colors.accent },
  duration: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  durationMine: { color: 'rgba(9,9,11,0.68)' },
  durationOther: { color: colors.subtle },
  pressed: { opacity: 0.72 },
});
