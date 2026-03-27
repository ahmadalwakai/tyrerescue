import { StyleSheet, Text, View } from 'react-native';
import { getStatusColor, radius, spacing, typography } from '@/ui/theme';

interface StatusChipProps {
  status: string;
  label?: string;
}

/**
 * StatusChip - Displays booking or driver status with proper branding
 * Uses the design system status color map
 */
export function StatusChip({ status, label }: StatusChipProps) {
  const { bg, text, label: defaultLabel } = getStatusColor(status);
  const displayLabel = label || defaultLabel;

  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>{displayLabel}</Text>
    </View>
  );
}

// Keep the old name for backwards compatibility
export const StatusPill = StatusChip;

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  text: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold as any,
  },
});
