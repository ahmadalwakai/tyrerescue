import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
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
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: 'rgba(3,6,15,0.97)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...Platform.select<ViewStyle>({
      web: { boxShadow: '0 -18px 40px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.08)' } as ViewStyle,
      default: {
        shadowColor: colors.shadow,
        shadowOpacity: 0.36,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: -11 },
        elevation: 8,
      },
    }),
  },
});
