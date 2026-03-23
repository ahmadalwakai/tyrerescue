import { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, radius, spacing } from '@/constants/theme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

function SkeletonBone({ width = '100%', height = 16, borderRadius = radius.md, style }: SkeletonProps) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: colors.border,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** Skeleton card that mimics a JobCard layout */
export function JobCardSkeleton() {
  return (
    <View style={skeletonStyles.card}>
      <View style={skeletonStyles.headerRow}>
        <SkeletonBone width={80} height={14} />
        <SkeletonBone width={64} height={22} borderRadius={radius.full} />
      </View>
      <SkeletonBone width="60%" height={16} style={{ marginTop: spacing.sm }} />
      <SkeletonBone width="90%" height={14} style={{ marginTop: spacing.sm }} />
      <View style={skeletonStyles.footerRow}>
        <SkeletonBone width={50} height={12} />
        <SkeletonBone width={80} height={12} />
      </View>
    </View>
  );
}

/** Skeleton for a chat conversation row */
export function ChatRowSkeleton() {
  return (
    <View style={skeletonStyles.chatRow}>
      <View style={{ flex: 1 }}>
        <SkeletonBone width={60} height={12} />
        <SkeletonBone width="70%" height={14} style={{ marginTop: 6 }} />
        <SkeletonBone width="45%" height={12} style={{ marginTop: 4 }} />
      </View>
      <SkeletonBone width={36} height={12} />
    </View>
  );
}

/** Skeleton for a notification row */
export function NotificationSkeleton() {
  return (
    <View style={skeletonStyles.notifRow}>
      <SkeletonBone width={36} height={36} borderRadius={18} />
      <View style={{ flex: 1 }}>
        <SkeletonBone width="70%" height={14} />
        <SkeletonBone width="90%" height={12} style={{ marginTop: 6 }} />
        <SkeletonBone width={60} height={10} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

/** Skeleton for message bubbles */
export function MessageSkeleton() {
  return (
    <View style={{ gap: spacing.sm, padding: spacing.md }}>
      <SkeletonBone width="65%" height={40} borderRadius={radius.lg} style={{ alignSelf: 'flex-start' }} />
      <SkeletonBone width="50%" height={32} borderRadius={radius.lg} style={{ alignSelf: 'flex-end' }} />
      <SkeletonBone width="75%" height={48} borderRadius={radius.lg} style={{ alignSelf: 'flex-start' }} />
      <SkeletonBone width="40%" height={28} borderRadius={radius.lg} style={{ alignSelf: 'flex-end' }} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
});
