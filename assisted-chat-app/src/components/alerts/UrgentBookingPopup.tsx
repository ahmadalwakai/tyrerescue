import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import type { BookingAlertSummary } from '@/hooks/useNewCustomerBookingAlert';
import { AppButton } from '../ui';
import { colors, fontSize, radius, space } from '../theme';
import {
  isNativeUrgentSoundAvailable,
  playNativeUrgentSound,
  stopNativeUrgentSound,
} from '@/lib/native-urgent-sound';

// Bundled native sound asset. Same file used by the notification channel
// (copied to android/app/src/main/res/raw/urgent_booking.mp3 by the
// expo-notifications config plugin), and loaded here directly via
// expo-audio so the foreground popup plays a sound that does NOT depend on
// the Android notification channel being audible (channel sound is sticky
// and can be silently dropped in foreground / on stale installs).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const URGENT_SOUND_NATIVE_SOURCE = require('../../../assets/sounds/urgent_booking.mp3');

// Minimum gap before the same booking id can re-trigger sound playback.
// Prevents spam if the popup re-renders quickly for the same alert while
// still allowing a reminder beep if the operator leaves it unresolved.
const SOUND_REPEAT_INTERVAL_MS = 60_000;

interface UrgentBookingPopupProps {
  visible: boolean;
  booking: BookingAlertSummary | null;
  onOpenBookings: () => void;
  onDismiss: () => void;
}

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const VIBRATION_PATTERN: ReadonlyArray<number> = [0, 500, 250, 500, 250, 900];

// Bundled urgent sound. On native the channel sound (set in app.json +
// notifications.ts) handles playback when the local notification fires.
// On web there are no notification channels, so we play the same asset
// via the HTML Audio element from inside the popup effect.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const URGENT_SOUND_MODULE = require('../../../assets/sounds/urgent_booking.mp3') as string | number | { default?: string; uri?: string };

// Metro/Expo web serves project assets at `/assets/<path-from-project-root>`.
// `require()` of an asset usually returns a numeric asset id (not a URL)
// in the web bundler, so we hardcode the dev-server path that Metro
// guarantees. Verified at runtime via `/assets/assets/sounds/urgent-booking.mp3`.
const WEB_URGENT_SOUND_FALLBACK_URL = '/assets/assets/sounds/urgent_booking.mp3';

function resolveWebSoundUrl(): string | null {
  if (Platform.OS !== 'web') return null;
  const mod = URGENT_SOUND_MODULE;
  if (typeof mod === 'string') return mod;
  if (typeof mod === 'object' && mod !== null) {
    if (typeof mod.default === 'string') return mod.default;
    if (typeof mod.uri === 'string') return mod.uri;
  }
  // `require()` returned an asset id (number) or unknown shape — fall back
  // to the Metro-served dev path.
  return WEB_URGENT_SOUND_FALLBACK_URL;
}

// ─── Web audio autoplay unlock ──────────────────────────────────────────────
// Browsers block Audio.play() until the user has interacted with the page.
// We register one-shot listeners on the first user gesture (click, touch,
// key) that "prime" an Audio element with the urgent sound. After the
// gesture, subsequent Audio instances are allowed to play without prompt.
let webAudioUnlocked = false;
function ensureWebAudioUnlock(): void {
  if (Platform.OS !== 'web') return;
  if (webAudioUnlocked) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof window.Audio !== 'function') return;
  const url = resolveWebSoundUrl();
  if (!url) return;
  const unlock = () => {
    if (webAudioUnlocked) return;
    webAudioUnlocked = true;
    try {
      const a = new window.Audio(url);
      a.muted = true;
      a.volume = 0;
      const p = a.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          try {
            a.pause();
            a.currentTime = 0;
          } catch {
            // ignore
          }
        }).catch(() => {
          // unlock failed; we will retry on next gesture
          webAudioUnlocked = false;
        });
      }
    } catch {
      webAudioUnlocked = false;
    }
    document.removeEventListener('click', unlock, true);
    document.removeEventListener('touchstart', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  };
  document.addEventListener('click', unlock, true);
  document.addEventListener('touchstart', unlock, true);
  document.addEventListener('keydown', unlock, true);
}

function formatCreatedAt(value: string | null): string {
  if (!value) return 'Unknown';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Full-screen modal that interrupts the operator with a high-contrast
 * urgent booking notice. Designed to be impossible to miss while the app
 * is open. NOT a substitute for OS-level push notifications when the app
 * is backgrounded / killed / on lock screen — Android does not let any
 * Expo managed app guarantee a forceful popup in those states.
 */
export function UrgentBookingPopup({
  visible,
  booking,
  onOpenBookings,
  onDismiss,
}: UrgentBookingPopupProps) {
  // Lazy useState so the Animated.Value is created once per mount but
  // does not trip the react-hooks/refs rule (refs are not for values
  // consumed during render).
  const [pulse] = useState(() => new Animated.Value(0));
  const [shimmer] = useState(() => new Animated.Value(0));
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const shimmerLoop = useRef<Animated.CompositeAnimation | null>(null);
  // Width of the "Open bookings" button, used to size the shimmer travel.
  const [buttonWidth, setButtonWidth] = useState(0);
  // Web-only HTMLAudioElement ref so we can stop playback on unmount.
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  // Web-only retry timer: if the browser blocks autoplay we keep trying
  // play() so as soon as the operator interacts with the page the sound
  // starts immediately.
  const webAudioRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Native (Android/iOS) audio player. Loaded once at mount; expo-audio
  // owns lifecycle and releases the underlying resource when the component
  // unmounts. On web the hook is a no-op for our purposes — we keep the
  // separate HTMLAudioElement path below to preserve existing browser
  // behaviour and avoid double-playback.
  const nativePlayer = useAudioPlayer(
    Platform.OS === 'web' ? null : URGENT_SOUND_NATIVE_SOURCE,
  );
  // Last bookingId we played sound for + timestamp. Used to suppress
  // spam re-plays for the same alert and to allow one reminder beep
  // after SOUND_REPEAT_INTERVAL_MS while the popup remains open.
  const lastSoundBookingIdRef = useRef<string | null>(null);
  const lastSoundPlayedAtRef = useRef<number>(0);
  const nativeReminderTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Register the autoplay unlock listeners once per popup mount. They
  // remove themselves after the first user gesture.
  useEffect(() => {
    ensureWebAudioUnlock();
  }, []);

  // Pulse the red banner while open; trigger device vibration once on open.
  useEffect(() => {
    if (!visible) {
      pulseLoop.current?.stop();
      pulse.setValue(0);
      return;
    }
    pulse.setValue(0);
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    );
    pulseLoop.current.start();

    // Shimmer animation across the primary CTA — pure Animated.Value, no
    // gradient dependency. Restarts whenever `visible` flips true.
    shimmer.setValue(0);
    shimmerLoop.current = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    );
    shimmerLoop.current.start();

    if (Platform.OS !== 'web') {
      try {
        // Second arg `true` repeats the pattern until Vibration.cancel().
        Vibration.vibrate(VIBRATION_PATTERN as number[], true);
      } catch {
        // ignore — vibration is best-effort
      }

      // Native foreground popup sound. On Android we prefer the bundled
      // Kotlin MediaPlayer module (reliable while app is foregrounded),
      // and fall back to expo-audio if that module is not linked.
      const bookingId = booking?.id ?? null;
      if (__DEV__) {
        console.log('[urgent-popup] open', {
          platform: Platform.OS,
          bookingId,
          nativeAvailable: isNativeUrgentSoundAvailable(),
        });
      }
      const playUrgentSoundOnce = () => {
        lastSoundPlayedAtRef.current = Date.now();
        if (__DEV__) {
          console.log('[urgent-popup] playUrgentSoundOnce', { bookingId });
        }
        // Try native MediaPlayer first.
        playNativeUrgentSound()
          .then((ok) => {
            if (ok) {
              if (__DEV__) console.log('[urgent-popup] native sound played');
              return;
            }
            // Fallback to expo-audio.
            try {
              nativePlayer.seekTo(0);
              nativePlayer.play();
              if (__DEV__) console.log('[urgent-popup] expo-audio fallback played');
            } catch (err) {
              if (__DEV__) console.warn('[urgent-popup] expo-audio fallback failed:', err);
            }
          })
          .catch((err) => {
            if (__DEV__) console.warn('[urgent-popup] native sound rejected:', err);
            try {
              nativePlayer.seekTo(0);
              nativePlayer.play();
            } catch (innerErr) {
              if (__DEV__) console.warn('[urgent-popup] expo-audio fallback failed:', innerErr);
            }
          });
      };
      const now = Date.now();
      const sameBooking = bookingId && lastSoundBookingIdRef.current === bookingId;
      const cooledDown = now - lastSoundPlayedAtRef.current >= SOUND_REPEAT_INTERVAL_MS;
      if (bookingId && (!sameBooking || cooledDown)) {
        lastSoundBookingIdRef.current = bookingId;
        playUrgentSoundOnce();
      }
      // Reminder timer: if the popup stays open longer than the cooldown
      // without being acknowledged, beep again once. Cleared on unmount.
      if (nativeReminderTimerRef.current) {
        clearInterval(nativeReminderTimerRef.current);
        nativeReminderTimerRef.current = null;
      }
      nativeReminderTimerRef.current = setInterval(() => {
        if (Date.now() - lastSoundPlayedAtRef.current >= SOUND_REPEAT_INTERVAL_MS) {
          playUrgentSoundOnce();
        }
      }, SOUND_REPEAT_INTERVAL_MS);
    } else {
      // Web fallback: play the bundled urgent sound directly, looping
      // until the operator opens or dismisses the popup.
      // Browsers may block autoplay until the user has interacted with
      // the page; we retry every 1.5s until it works.
      const url = resolveWebSoundUrl();
      if (url && typeof window !== 'undefined' && typeof window.Audio === 'function') {
        try {
          const audio = new window.Audio(url);
          audio.preload = 'auto';
          audio.loop = true;
          audio.volume = 1;
          webAudioRef.current = audio;
          const tryPlay = () => {
            const p = audio.play();
            if (p && typeof p.then === 'function') {
              p.then(() => {
                if (webAudioRetryRef.current) {
                  clearInterval(webAudioRetryRef.current);
                  webAudioRetryRef.current = null;
                }
              }).catch(() => {
                // Autoplay blocked — keep the retry timer running.
              });
            }
          };
          tryPlay();
          webAudioRetryRef.current = setInterval(tryPlay, 1500);
        } catch {
          // ignore — audio is best-effort
        }
      }
    }

    return () => {
      pulseLoop.current?.stop();
      shimmerLoop.current?.stop();
      if (Platform.OS !== 'web') {
        try {
          Vibration.cancel();
        } catch {
          // ignore
        }
        if (nativeReminderTimerRef.current) {
          clearInterval(nativeReminderTimerRef.current);
          nativeReminderTimerRef.current = null;
        }
        try {
          // Stop any in-flight foreground beep when popup closes.
          // The underlying audio resource is released automatically by
          // expo-audio when the hosting component unmounts.
          nativePlayer.pause();
        } catch {
          // ignore — best-effort
        }
        // Also stop the native MediaPlayer in case it is still playing.
        void stopNativeUrgentSound();
      } else if (webAudioRef.current) {
        if (webAudioRetryRef.current) {
          clearInterval(webAudioRetryRef.current);
          webAudioRetryRef.current = null;
        }
        try {
          webAudioRef.current.pause();
          webAudioRef.current.currentTime = 0;
        } catch {
          // ignore
        }
        webAudioRef.current = null;
      }
    };
  }, [visible, pulse, shimmer, booking?.id, nativePlayer]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] });
  // Shimmer travels from off-left to off-right of the button. We add the
  // shimmer band width (90px) on each side so it fully enters and exits.
  const shimmerBandWidth = 90;
  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-shimmerBandWidth, Math.max(buttonWidth, 0) + shimmerBandWidth],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.overlay} accessibilityViewIsModal>
        <View style={styles.card}>
          <Animated.View style={[styles.headerBar, { opacity }]} />
          <Text style={styles.eyebrow}>Urgent</Text>
          <Text style={styles.title} accessibilityRole="header">
            Emergency booking received
          </Text>
          <Text style={styles.body}>
            A customer has created an emergency booking. Open bookings now.
          </Text>

          <View style={styles.detailsBox}>
            <DetailRow label="Customer" value={booking?.customerName || 'Unknown'} />
            <DetailRow label="Phone" value={booking?.customerPhone || 'Unknown'} />
            <DetailRow label="Location" value={booking?.addressLine || 'See bookings list'} />
            <DetailRow label="Tyre size" value={booking?.tyreSize || 'See bookings list'} />
            <DetailRow label="Created" value={formatCreatedAt(booking?.createdAt ?? null)} />
            {booking?.refNumber ? (
              <DetailRow label="Ref" value={booking.refNumber} />
            ) : null}
          </View>

          <View style={styles.buttonRow}>
            <View
              style={styles.primaryButtonWrap}
              onLayout={(e) => setButtonWidth(e.nativeEvent.layout.width)}
            >
              <AppButton
                label="Open bookings"
                variant="primary"
                onPress={onOpenBookings}
                fullWidth
                accessibilityLabel="Open the bookings list for this emergency booking"
              />
              {/* White shimmer overlay. pointerEvents=none so the button stays tappable. */}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.shimmerBand,
                  {
                    width: shimmerBandWidth,
                    transform: [
                      { translateX: shimmerTranslate },
                      { skewX: '-20deg' },
                    ],
                  },
                ]}
              />
            </View>
          </View>
          <View style={styles.buttonRow}>
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss this urgent booking popup for now"
              style={({ pressed }) => [
                styles.dismissButton,
                pressed && styles.dismissButtonPressed,
              ]}
            >
              <Text style={styles.dismissLabel}>Dismiss for now</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderColor: colors.dangerBorder,
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: space.xl,
    overflow: 'hidden',
  },
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: colors.dangerBorder,
  },
  eyebrow: {
    color: colors.danger,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: space.sm,
    marginTop: space.xs,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    marginBottom: space.sm,
  },
  body: {
    color: colors.muted,
    fontSize: fontSize.md,
    marginBottom: space.lg,
  },
  detailsBox: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    marginBottom: space.lg,
  },
  detailRow: {
    flexDirection: 'row',
    paddingVertical: space.xs,
    gap: space.sm,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '600',
    minWidth: 80,
  },
  detailValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    flex: 1,
  },
  buttonRow: {
    marginTop: space.sm,
  },
  primaryButtonWrap: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  shimmerBand: {
    position: 'absolute',
    top: -10,
    bottom: -10,
    left: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  dismissButton: {
    alignSelf: 'stretch',
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  dismissButtonPressed: {
    backgroundColor: colors.card,
  },
  dismissLabel: {
    color: colors.muted,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
