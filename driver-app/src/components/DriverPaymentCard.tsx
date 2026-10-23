import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { PaymentSummary } from '@/api/client';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { getDriverPaymentDisplay, paymentToneColors } from '@/lib/payment-status';

interface DriverPaymentCardProps {
  payment?: PaymentSummary | null;
  /** A short status row for a job list; full card for the job itself. */
  compact?: boolean;
}

export function DriverPaymentCard({ payment, compact = false }: DriverPaymentCardProps) {
  const { t } = useI18n();
  const display = getDriverPaymentDisplay(payment);
  const tone = paymentToneColors(display.tone);
  const paid = display.tone === 'paid';

  return (
    <View
      testID="driver-payment-card"
      accessibilityRole="summary"
      accessibilityLabel={`${t(display.labelKey)}${display.amountLabel ? `. ${t('payment.cashRemaining')}: ${display.amountLabel}` : ''}`}
      style={[styles.card, compact && styles.compact, { backgroundColor: tone.bg, borderColor: tone.border }]}
    >
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: tone.bg }]}>
          <Ionicons name={paid ? 'checkmark-circle' : 'alert-circle-outline'} color={tone.text} size={compact ? 20 : 25} />
        </View>
        <View style={styles.copy}>
          {!compact && <Text style={styles.eyebrow}>{t('jobDetail.payment')}</Text>}
          <Text style={[styles.status, { color: tone.text }]}>{t(display.labelKey)}</Text>
          {!compact && <Text style={styles.description}>{t(display.descriptionKey)}</Text>}
        </View>
        {compact && display.amountLabel && (
          <View style={styles.compactAmount}>
            <Text style={styles.cashLabel}>{t('payment.cashRemaining')}</Text>
            <Text style={[styles.amount, { color: tone.text }]}>{display.amountLabel}</Text>
          </View>
        )}
      </View>
      {!compact && display.amountLabel && (
        <View style={styles.balance}>
          <Text style={styles.balanceLabel}>{t('payment.cashRemaining')}</Text>
          <Text style={[styles.balanceAmount, { color: tone.text }]}>{display.amountLabel}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md },
  compact: { borderRadius: radius.lg, padding: spacing.sm, marginTop: spacing.sm, marginBottom: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: 38, height: 38, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.muted, fontSize: fontSize.xs, fontFamily: 'Inter_600SemiBold', marginBottom: 3 },
  status: { fontSize: fontSize.lg, fontFamily: 'Inter_700Bold' },
  description: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20, marginTop: 4 },
  compactAmount: { alignItems: 'flex-end', flexShrink: 1 },
  cashLabel: { color: colors.muted, fontSize: fontSize.xs, fontFamily: 'Inter_600SemiBold' },
  amount: { fontSize: fontSize.lg, fontFamily: 'Inter_700Bold', marginTop: 2 },
  balance: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', marginTop: spacing.md, paddingTop: spacing.md },
  balanceLabel: { color: colors.text, fontSize: fontSize.sm, fontFamily: 'Inter_600SemiBold' },
  balanceAmount: { fontSize: 32, fontFamily: 'Inter_700Bold', marginTop: 4 },
});
