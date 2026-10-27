import { useEffect, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, Text, View } from 'react-native';
import type { IncomingPhoneCall } from '@/lib/incoming-phone-call';
import type { IncomingCallerHistoryResult } from '@/lib/incoming-caller-history';
import { AppIcon } from './icons/AppIcon';
import { USE_NATIVE_DRIVER, useReducedMotion } from './motion';
import { colors, radius } from './theme';

const DISPLAY_DURATION_MS = 4_000;
const TRANSITION_DURATION_MS = 180;

/** Mount with a callId key so every new call gets its own four-second lifetime. */
export function HeaderIncomingCallPopup({ call, history, onDismiss }: {
  call: IncomingPhoneCall;
  history: IncomingCallerHistoryResult;
  onDismiss: (callId: string) => void;
}) {
  const [expiresAt] = useState(() => Date.now() + DISPLAY_DURATION_MS);
  const [visibility] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();
  const label = history.status === 'found' ? 'Returning customer'
    : history.status === 'not_found' ? 'No previous bookings'
    : history.status === 'unavailable' ? 'History unavailable'
    : 'Checking customer history…';
  const detail = history.status === 'found'
    ? history.matches.length > 1 ? `${history.matches.length} records · confirm customer`
      : history.matches[0]?.customer.name || 'Previous bookings with this number'
    : null;
  const statusColor = history.status === 'found' ? colors.success
    : history.status === 'unavailable' ? colors.warning : colors.muted;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(call.callId), Math.max(0, expiresAt - Date.now()));
    const subscription = AppState.addEventListener('change', (state) => {
      // iOS can suspend JS timers while the native call screen is in front.
      if (state === 'active' && Date.now() >= expiresAt) onDismiss(call.callId);
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [call.callId, expiresAt, onDismiss]);

  useEffect(() => {
    visibility.setValue(reducedMotion ? 1 : 0);
    if (reducedMotion) return undefined;
    const remaining = Math.max(0, expiresAt - Date.now());
    const transition = Math.min(TRANSITION_DURATION_MS, remaining / 2);
    const animation = Animated.sequence([
      Animated.timing(visibility, {
        toValue: 1, duration: transition, easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.delay(Math.max(0, remaining - transition * 2)),
      Animated.timing(visibility, {
        toValue: 0, duration: transition, easing: Easing.in(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [expiresAt, reducedMotion, visibility]);

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Incoming call from ${call.phone}. ${label}${detail ? `. ${detail}` : ''}`}
        testID="assisted-chat-header-incoming-call"
        style={[
          styles.popup,
          {
            opacity: visibility,
            transform: [{ translateY: visibility.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
          },
        ]}
      >
        <View style={styles.icon}>
          <AppIcon name="phone" size={18} color={colors.success} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.label, { color: statusColor }]} numberOfLines={1}>{label}</Text>
          <Text style={styles.phone} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {call.phone}
          </Text>
          {detail ? <Text style={styles.detail} numberOfLines={1}>{detail}</Text> : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 6 },
  popup: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.successBorder,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow, shadowOpacity: 0.28, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successBg },
  copy: { minWidth: 0, flexShrink: 1 },
  label: { color: colors.success, fontSize: 11, fontWeight: '700' },
  detail: { color: colors.muted, fontSize: 12, marginTop: 2 },
  phone: { color: colors.text, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 2 },
});
