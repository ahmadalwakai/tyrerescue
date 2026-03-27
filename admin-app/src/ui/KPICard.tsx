import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/ui/theme';

interface KPICardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  size?: 'sm' | 'md';
}

/**
 * KPICard - Displays key performance indicators
 * Used for dashboard metrics like revenue, pending bookings, etc.
 */
export function KPICard({
  label,
  value,
  unit,
  icon,
  trend,
  trendValue,
  size = 'md',
}: KPICardProps) {
  const isSmall = size === 'sm';
  const padding = isSmall ? spacing.md : spacing.lg;
  const labelSize = isSmall ? typography.size.xs : typography.size.sm;
  const valueSize = isSmall ? typography.size.lg : typography.size.xxl;

  const trendColor = trend === 'up' ? colors.success : trend === 'down' ? colors.error : colors.textMuted;

  return (
    <View style={[styles.card, { padding }]}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text style={[styles.label, { fontSize: labelSize }]}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { fontSize: valueSize }]}>{value}</Text>
        {unit && <Text style={[styles.unit, { fontSize: labelSize }]}>{unit}</Text>}
      </View>
      {trendValue && (
        <Text style={[styles.trend, { color: trendColor, fontSize: labelSize }]}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''} {trendValue}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    justifyContent: 'space-between',
  },
  icon: {
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontWeight: typography.weight.medium,
    marginBottom: spacing.xs,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  value: {
    color: colors.text,
    fontWeight: typography.weight.bold,
  },
  unit: {
    color: colors.textMuted,
    fontWeight: typography.weight.medium,
  },
  trend: {
    marginTop: spacing.sm,
    fontWeight: typography.weight.medium,
  },
});
