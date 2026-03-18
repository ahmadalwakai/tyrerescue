import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, radius } from '@/constants/theme';

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: '#3F3F46', text: '#A1A1AA', label: 'Draft' },
  pricing_ready: { bg: '#3F3F46', text: '#A1A1AA', label: 'Pricing Ready' },
  awaiting_payment: { bg: '#78350F', text: '#FDE68A', label: 'Awaiting Payment' },
  paid: { bg: '#14532D', text: '#86EFAC', label: 'Paid' },
  payment_failed: { bg: '#7F1D1D', text: '#FCA5A5', label: 'Payment Failed' },
  driver_assigned: { bg: '#1E3A5F', text: '#93C5FD', label: 'Assigned' },
  en_route: { bg: '#7C2D12', text: '#FDBA74', label: 'En Route' },
  arrived: { bg: '#7C2D12', text: '#FDBA74', label: 'Arrived' },
  in_progress: { bg: '#7C2D12', text: colors.accent, label: 'In Progress' },
  completed: { bg: '#14532D', text: '#86EFAC', label: 'Completed' },
  cancelled: { bg: '#7F1D1D', text: '#FCA5A5', label: 'Cancelled' },
  cancelled_refund_pending: { bg: '#7F1D1D', text: '#FCA5A5', label: 'Refund Pending' },
  refunded: { bg: '#3F3F46', text: '#A1A1AA', label: 'Refunded' },
  refunded_partial: { bg: '#3F3F46', text: '#A1A1AA', label: 'Partial Refund' },
};

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { bg: '#3F3F46', text: '#A1A1AA', label: status };

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.text, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: fontSize.xs,
    fontFamily: 'Inter_600SemiBold',
  },
});
