import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import type { IncomingPhoneCall } from '@/lib/incoming-phone-call';
import type { IncomingCallerHistoryResult } from '@/lib/incoming-caller-history';
import { AppIcon } from './icons/AppIcon';
import { USE_NATIVE_DRIVER, useReducedMotion } from './motion';
import { colors, radius } from './theme';

const DISPLAY_DURATION_MS = 4_000;
const TRANSITION_DURATION_MS = 180;
const MAX_CALL_AGE_MS = 90_000;

/** Mount with a callId/variant key; each popup gets four visible foreground seconds. */
export function HeaderIncomingCallPopup({ call, history, onDismiss, visible = true, variant = 'call' }: {
  call: IncomingPhoneCall;
  history: IncomingCallerHistoryResult;
  onDismiss: (callId: string) => void;
  visible?: boolean;
  variant?: 'call' | 'history';
}) {
  const staleAt = Date.parse(call.receivedAt) + MAX_CALL_AGE_MS;
  const [foreground, setForeground] = useState(() => Platform.OS === 'web' || AppState.currentState === 'active');
  const [foregroundCycle, setForegroundCycle] = useState(0);
  const [dismissed, setDismissed] = useState(() => !Number.isFinite(staleAt) || Date.now() >= staleAt);
  const [visibility] = useState(() => new Animated.Value(0));
  const remainingMs = useRef(DISPLAY_DURATION_MS);
  const startedAt = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const dismissedRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  const reducedMotion = useReducedMotion();
  const show = visible && foreground && !dismissed;
  const label = variant === 'call' ? 'Incoming call'
    : history.status === 'found' ? 'Returning customer'
    : history.status === 'not_found' ? 'No previous bookings'
    : history.status === 'unavailable' ? 'History unavailable'
    : 'Checking customer history…';
  const detail = variant === 'history' && history.status === 'found'
    ? history.matches.length > 1 ? `${history.matches.length} records · confirm customer`
      : history.matches[0]?.customer.name || 'Previous bookings with this number'
    : null;
  const previousAmount = variant === 'history' && history.status === 'found' && history.matches.length === 1
    ? history.matches[0]?.bookings[0]?.totalAmount : null;
  const previousPrice = typeof previousAmount === 'string' && previousAmount.trim() !== '' && Number.isFinite(Number(previousAmount))
    ? Number(previousAmount).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' }) : null;
  const priceDetail = variant === 'history' && history.status === 'found' && history.matches.length === 1
    ? `Previous booking price: ${previousPrice ?? 'Not recorded'}` : null;
  const statusColor = variant === 'call' || history.status === 'found' ? colors.success
    : history.status === 'unavailable' ? colors.warning : colors.muted;

  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  const pause = useCallback(() => {
    if (startedAt.current !== null) {
      remainingMs.current = Math.max(0, remainingMs.current - (Date.now() - startedAt.current));
      startedAt.current = null;
    }
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    animation.current?.stop();
    animation.current = null;
    visibility.setValue(0);
  }, [visibility]);
  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    pause();
    setDismissed(true);
    onDismissRef.current(call.callId);
  }, [call.callId, pause]);

  useEffect(() => {
    if (!Number.isFinite(staleAt) || Date.now() >= staleAt) {
      dismiss();
      return undefined;
    }
    const staleTimer = setTimeout(dismiss, staleAt - Date.now());
    const subscription = AppState.addEventListener('change', (state) => {
      const active = Platform.OS === 'web' || state === 'active';
      // Pause immediately in the native event, before React can be suspended.
      if (!active) pause();
      setForeground(active);
      // Inactive/active events can be batched before React commits a hidden
      // render. Still restart the paused clock with its remaining duration.
      if (active) setForegroundCycle((cycle) => cycle + 1);
      if (Date.now() >= staleAt) dismiss();
    });
    return () => {
      clearTimeout(staleTimer);
      subscription.remove();
    };
  }, [dismiss, pause, staleAt]);

  useEffect(() => {
    if (!show) {
      pause();
      return undefined;
    }
    const remaining = remainingMs.current;
    if (remaining <= 0) {
      dismiss();
      return undefined;
    }
    startedAt.current = Date.now();
    timer.current = setTimeout(dismiss, remaining);
    visibility.setValue(reducedMotion ? 1 : 0);
    if (reducedMotion) return pause;
    const transition = Math.min(TRANSITION_DURATION_MS, remaining / 2);
    animation.current = Animated.sequence([
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
    animation.current.start();
    return pause;
  }, [dismiss, foregroundCycle, pause, reducedMotion, show, visibility]);

  if (!show) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${label}. ${call.phone}${detail ? `. ${detail}` : ''}${priceDetail ? `. ${priceDetail}` : ''}`}
        testID={variant === 'history' ? 'assisted-chat-header-caller-history' : 'assisted-chat-header-incoming-call'}
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
          {priceDetail ? <Text style={styles.detail} numberOfLines={1}>{priceDetail}</Text> : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center', width: '100%' },
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
