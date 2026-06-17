import { View, Text, StyleSheet } from 'react-native';
import { useRef } from 'react';
import { colors, spacing, fontSize, radius, cardShadow } from '@/constants/theme';
import { AnimatedPressable } from './AnimatedPressable';
import { StatusBadge } from './StatusBadge';
import { lightHaptic } from '@/services/haptics';
import { format } from 'date-fns';
import type { JobSummary, PaymentSummary } from '@/api/client';
import { useI18n } from '@/i18n';
import { formatGbpFromPence, getDriverPaymentDisplay, paymentToneColors } from '@/lib/payment-status';

function paymentLine(
  payment: PaymentSummary,
  display: ReturnType<typeof getDriverPaymentDisplay>,
  t: (k: string) => string,
): string {
  const lines: string[] = [];
  if (payment.totalAmountPence != null && payment.totalAmountPence > 0) {
    lines.push(`${t('jobs.jobPrice')}: ${formatGbpFromPence(payment.totalAmountPence) ?? t('jobs.unknown')}`);
  }
  lines.push(
    `${t(display.labelKey)}${display.amountLabel != null ? ` · ${display.amountLabel}` : ''}`,
  );
  return lines.join('\n');
}

interface JobCardProps {
  job: JobSummary;
  onPress: () => void;
}

export function JobCard({ job, onPress }: JobCardProps) {
  const { t, dateLocale } = useI18n();
  const paymentDisplay = job.payment
    ? getDriverPaymentDisplay(job.payment, job.refNumber)
    : null;
  const paymentColors = paymentDisplay ? paymentToneColors(paymentDisplay.tone) : null;
  // Guard against a rapid double-tap pushing the detail screen twice.
  const navLockRef = useRef(false);
  return (
    <AnimatedPressable
      onPress={() => {
        if (navLockRef.current) return;
        navLockRef.current = true;
        setTimeout(() => {
          navLockRef.current = false;
        }, 800);
        lightHaptic();
        onPress();
      }}
      style={styles.card}
      pressScale={0.97}
    >
      <View style={styles.header}>
        <Text style={styles.ref}>#{job.refNumber}</Text>
        <StatusBadge status={job.status} />
      </View>

      <Text style={styles.customer} numberOfLines={1}>
        {job.customerName}
      </Text>

      <Text style={styles.address} numberOfLines={2}>
        {job.addressLine}
      </Text>

      <View style={styles.footer}>
        <Text style={styles.meta}>
          {job.serviceType === 'mobile_fitting' ? t('jobs.fitting') : t('jobs.emergency')}
        </Text>
        {job.scheduledAt && (
          <Text style={styles.meta}>
            {format(new Date(job.scheduledAt), 'dd MMM, HH:mm', { locale: dateLocale })}
          </Text>
        )}
        {job.tyreSizeDisplay && (
          <Text style={styles.meta}>{job.tyreSizeDisplay}</Text>
        )}
      </View>

      {job.payment && paymentDisplay && paymentColors && (
        <Text
          style={[
            styles.collect,
            paymentDisplay.tone === 'paid'
              ? styles.collectMuted
              : styles.collectActive,
            { color: paymentColors.text },
          ]}
          numberOfLines={2}
        >
          {paymentLine(job.payment, paymentDisplay, t)}
        </Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    ...cardShadow,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  ref: {
    color: colors.accent,
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.sm,
  },
  customer: {
    color: colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.base,
    marginBottom: 2,
  },
  address: {
    color: colors.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  meta: {
    color: colors.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
  },
  collect: {
    marginTop: spacing.sm,
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
  },
  collectActive: {
    color: colors.accent,
  },
  collectMuted: {
    color: colors.muted,
  },
});
