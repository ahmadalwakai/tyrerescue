import { PropsWithChildren } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, spacing, shadows } from '@/ui/theme';

interface CardProps extends PropsWithChildren {
  style?: ViewStyle;
  elevated?: boolean;
}

/**
 * Card - Main container component for content sections
 * Uses design system spacing, radius, and shadows
 */
export function Card({ children, style, elevated = false }: CardProps) {
  return (
    <View style={[styles.card, elevated && styles.elevated, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: colors.bg,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  elevated: {
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
});
