import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '@/constants/theme';
import { useJobAlert } from '@/context/job-alert-context';
import { useI18n } from '@/i18n';
import { lightHaptic } from '@/services/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function JobAlertPopup() {
  const { visible, alertData, dismiss } = useJobAlert();
  const router = useRouter();
  const { t } = useI18n();
  const navigatingRef = useRef(false);

  // ── Pulse animation ──
  const scale = useSharedValue(1);
  const shadowOpacity = useSharedValue(0.3);
  const animRunning = useRef(false);

  useEffect(() => {
    if (visible) {
      // Reset navigation lock when popup becomes visible
      navigatingRef.current = false;
      animRunning.current = true;
      scale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, // infinite
        false,
      );
      shadowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(scale);
      cancelAnimation(shadowOpacity);
      scale.value = 1;
      shadowOpacity.value = 0.3;
      animRunning.current = false;
    }
  }, [visible]);

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const animatedGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: shadowOpacity.value,
  }));

  const handleGetStarted = () => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;

    // Stop animation immediately
    cancelAnimation(scale);
    cancelAnimation(shadowOpacity);
    scale.value = 1;
    shadowOpacity.value = 0.3;
    animRunning.current = false;

    const ref = alertData?.ref;
    dismiss();
    lightHaptic();

    if (ref) {
      router.push(`/(tabs)/jobs/${ref}`);
    } else {
      router.push('/(tabs)/jobs');
    }
  };

  if (!visible || !alertData) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.overlay}>
        <Animated.View
          entering={FadeIn.duration(250)}
          exiting={FadeOut.duration(200)}
          style={styles.card}
        >
          {/* Icon */}
          <View style={styles.iconCircle}>
            <Ionicons name="car-sport" size={36} color="#fff" />
          </View>

          {/* Title */}
          <Text style={styles.title}>{t('jobAlert.title')}</Text>

          {/* Job ref */}
          {alertData.ref && (
            <Text style={styles.refText}>#{alertData.ref}</Text>
          )}

          {/* Body / address info */}
          {alertData.body ? (
            <Text style={styles.bodyText} numberOfLines={3}>
              {alertData.body}
            </Text>
          ) : null}

          {/* GET STARTED button with pulse animation */}
          <AnimatedPressable
            onPress={handleGetStarted}
            style={[styles.buttonOuter, animatedGlowStyle]}
          >
            <Animated.View style={[styles.buttonInner, animatedButtonStyle]}>
              <Ionicons name="rocket" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.buttonText}>{t('jobAlert.getStarted')}</Text>
            </Animated.View>
          </AnimatedPressable>

          {/* Dismiss link */}
          <Pressable onPress={dismiss} style={styles.dismissButton} hitSlop={12}>
            <Text style={styles.dismissText}>{t('jobAlert.dismiss')}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.xl,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  refText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.lg,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  bodyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.base,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
    paddingHorizontal: spacing.sm,
  },
  buttonOuter: {
    width: '85%',
    borderRadius: radius.lg,
    // Glow shadow
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
    marginBottom: spacing.md,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F97316',
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
  },
  buttonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.lg,
    color: '#fff',
    letterSpacing: 0.5,
  },
  dismissButton: {
    paddingVertical: spacing.sm,
  },
  dismissText: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: colors.muted,
  },
});
