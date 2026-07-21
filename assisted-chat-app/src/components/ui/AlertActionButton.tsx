import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';
import { colors, fontSize, radius } from '../theme';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

interface AlertActionButtonProps {
  label: string;
  active: boolean;
  badgeLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
}

/**
 * Action button that enters a calm "alert" state when `active` is true:
 *   - red background + border
 *   - slow white shimmer overlay sweeping across the surface
 *   - gentle pulse on the badge
 *   - small "New" badge in the corner
 *
 * Animations are intentionally slow (~1.6s shimmer, ~1.4s pulse) to satisfy
 * accessibility — no fast flashing. When `active` becomes false the button
 * falls back to the secondary look used elsewhere (`AppButton variant="secondary"`).
 */
export function AlertActionButton({
  label,
  active,
  badgeLabel,
  onPress,
  disabled = false,
  testID,
  style,
}: AlertActionButtonProps) {
  const [shimmer] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  const shimmerLoop = useRef<Animated.CompositeAnimation | null>(null);
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const [buttonWidth, setButtonWidth] = useState(0);

  useEffect(() => {
    if (!active) {
      shimmerLoop.current?.stop();
      pulseLoop.current?.stop();
      shimmer.setValue(0);
      pulse.setValue(0);
      return;
    }
    shimmer.setValue(0);
    shimmerLoop.current = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1600,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    );
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
    shimmerLoop.current.start();
    pulseLoop.current.start();

    return () => {
      shimmerLoop.current?.stop();
      pulseLoop.current?.stop();
    };
  }, [active, shimmer, pulse]);

  // Stop animations on unmount.
  useEffect(
    () => () => {
      shimmerLoop.current?.stop();
      pulseLoop.current?.stop();
    },
    [],
  );

  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-SHIMMER_WIDTH, Math.max(buttonWidth, 220) + SHIMMER_WIDTH],
  });
  const badgeScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  const accessibilityLabel = active
    ? `${label}, new booking received`
    : label;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      testID={testID}
      android_ripple={{ color: colors.ripple, borderless: false }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onLayout={(event) => setButtonWidth(event.nativeEvent.layout.width)}
      style={({ pressed }) => [
        styles.base,
        active ? styles.alertBase : styles.idleBase,
        pressed && !disabled && (active ? styles.alertPressed : styles.idlePressed),
        disabled && styles.disabled,
        style,
      ]}
    >
      {active ? (
        <Animated.View
          style={[
            styles.shimmer,
            styles.noPointerEvents,
            { transform: [{ translateX: shimmerTranslate }, { skewX: '-18deg' }] },
          ]}
        />
      ) : null}
      <Text
        style={[styles.label, active ? styles.alertLabel : styles.idleLabel]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {active && badgeLabel ? (
        <Animated.View style={[styles.badge, { transform: [{ scale: badgeScale }] }]}>
          <Text style={styles.badgeText} numberOfLines={1}>
            {badgeLabel}
          </Text>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

const ALERT_RED = '#B91C1C';
const ALERT_RED_BORDER = '#7F1D1D';
const ALERT_RED_PRESSED = '#991B1B';
const SHIMMER_WIDTH = 88;

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  idleBase: {
    backgroundColor: colors.glassStrong,
    borderColor: colors.borderStrong,
  },
  idlePressed: {
    backgroundColor: colors.panel,
  },
  alertBase: {
    backgroundColor: ALERT_RED,
    borderColor: ALERT_RED_BORDER,
  },
  alertPressed: {
    backgroundColor: ALERT_RED_PRESSED,
  },
  disabled: { opacity: 0.5 },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  idleLabel: { color: colors.text },
  alertLabel: { color: '#FFFFFF' },
  shimmer: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    left: 0,
    width: SHIMMER_WIDTH,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  noPointerEvents: {
    pointerEvents: 'none',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: ALERT_RED_BORDER,
  },
  badgeText: {
    color: ALERT_RED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
});
