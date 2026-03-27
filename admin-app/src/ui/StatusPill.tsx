import { StyleSheet, Text, View } from 'react-native';
import { statusColors, driverStatusColors, radius, spacing, typography } from '@/ui/theme';

interface StatusChipProps {
  status: string;
  label?: string;
}

/**
 * StatusChip - Displays booking or driver status with proper branding.
 * Checks booking status map first, then driver status map, then falls back
 * to the pending style so unknown values are always readable.
 */
export function StatusChip({ status, label }: StatusChipProps) {
  const statusColor =
    statusColors[status] ??
    driverStatusColors[status] ??
    statusColors.pending;
  const { bg, text, label: defaultLabel } = statusColor;
  const displayLabel = label ?? defaultLabel;

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
    paddingHorizontal: spacing.md,
  },
  text: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    letterSpacing: 0.3,
  },
});
