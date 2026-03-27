import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { Animated } from 'react-native';
import { colors, radius, spacing } from '@/ui/theme';

interface LoadingSkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * LoadingSkeleton - Animated loading placeholder
 */
export function LoadingSkeleton({
  width = '100%',
  height = 16,
  borderRadius = radius.md,
  style,
}: LoadingSkeletonProps) {
  const [shimmerAnim] = useState(() => new Animated.Value(0));

  const opacity = useMemo(
    () => shimmerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 1, 0.5] }),
    [shimmerAnim],
  );

  useEffect(() => {
    let active = true;
    const loop = () => {
      if (!active) return;
      shimmerAnim.setValue(0);
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: false,
      }).start(() => loop());
    };
    loop();
    return () => {
      active = false;
      shimmerAnim.stopAnimation();
    };
  }, [shimmerAnim]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * SkeletonLine - Helper for creating skeleton lines
 */
export function SkeletonLine({ style }: { style?: StyleProp<ViewStyle> }) {
  return <LoadingSkeleton height={16} style={[{ marginBottom: spacing.md }, style]} />;
}

/**
 * SkeletonCard - Placeholder for a card
 */
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <LoadingSkeleton height={24} width="60%" style={{ marginBottom: spacing.sm }} />
      <LoadingSkeleton height={16} width="80%" style={{ marginBottom: spacing.md }} />
      <LoadingSkeleton height={16} width="100%" style={{ marginBottom: spacing.xs }} />
      <LoadingSkeleton height={16} width="90%" />
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
});
