import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../theme';

export interface BottomSafeActionBarProps {
  children: ReactNode;
  /** Extra padding above the system navigation. Defaults to 8 px. */
  extraBottom?: number;
}

/**
 * Sticky bottom action bar that always clears the Android system navigation
 * bar (gesture or three-button). Uses `react-native-safe-area-context`
 * insets which is already a top-level dependency in this app.
 *
 * Wrap the screen's primary CTA(s) with this so the operator never has to
 * fight the system buttons for taps.
 */
export function BottomSafeActionBar({ children, extraBottom = 8 }: BottomSafeActionBarProps) {
  const insets = useSafeAreaInsets();
  const paddingBottom = Math.max(insets.bottom + extraBottom, space.lg);
  return <View style={[styles.bar, { paddingBottom }]}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
