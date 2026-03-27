import { StyleSheet, View } from 'react-native';
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { colors, radius, spacing } from '@/ui/theme';

interface LoadingSkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
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
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = () => {
      shimmerAnim.setValue(0);
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: false,
      }).start(() => loop());
    };
    loop();
  }, []);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.5, 1, 0.5],
  });

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
export function SkeletonLine({ style }: { style?: any }) {
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
