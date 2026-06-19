import { View, Text, StyleSheet } from 'react-native';
import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius, cardShadow } from '@/constants/theme';
import { AnimatedPressable } from './AnimatedPressable';
import { StatusBadge } from './StatusBadge';
import { lightHaptic } from '@/services/haptics';
import { format } from 'date-fns';
import type { JobSummary } from '@/api/client';
import { useI18n } from '@/i18n';
import { formatGbpFromPence, getDriverPaymentDisplay, paymentToneColors } from '@/lib/payment-status';

type JobCardIcon = keyof typeof Ionicons.glyphMap;

function paymentIcon(tone: ReturnType<typeof getDriverPaymentDisplay>['tone']): JobCardIcon {
  switch (tone) {
    case 'paid':
      return 'checkmark-circle';
    case 'failed':
      return 'close-circle';
    case 'warning':
    case 'action':
      return 'alert-circle';
    case 'pending':
      return 'time';
    case 'unknown':
    default:
      return 'help-circle';
  }
}

function statusEdgeColor(job: JobSummary): string {
  if (job.serviceType !== 'mobile_fitting') return colors.danger;
  if (job.status === 'en_route' || job.status === 'arrived' || job.status === 'in_progress') {
    return colors.accent;
  }
  if (job.status === 'completed') return colors.success;
  return colors.info;
}

function MetaChip({
  icon,
  label,
}: {
  icon: JobCardIcon;
  label: string | null | undefined;
}) {
  if (!label) return null;
  return (
    <View style={styles.metaChip}>
      <Ionicons name={icon} size={13} color={colors.muted} />
      <Text style={styles.metaChipText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

interface JobCardProps {
  job: JobSummary;
  onPress: () => void;
}

export function JobCard({ job, onPress }: JobCardProps) {
  const { t, dateLocale } = useI18n();
  const payment = job.paymentSummary ?? job.payment ?? null;
  const paymentDisplay = payment
    ? getDriverPaymentDisplay(payment, job.refNumber)
    : null;
  const paymentColors = paymentDisplay ? paymentToneColors(paymentDisplay.tone) : null;
  const totalLabel = formatGbpFromPence(payment?.totalPence);
  const serviceLabel = job.serviceType === 'mobile_fitting' ? t('jobs.fitting') : t('jobs.emergency');
  const scheduledLabel = job.scheduledAt
    ? format(new Date(job.scheduledAt), 'dd MMM, HH:mm', { locale: dateLocale })
    : null;
  const paymentLabel = paymentDisplay
    ? `${t(paymentDisplay.labelKey)}${paymentDisplay.amountLabel != null ? ` · ${paymentDisplay.amountLabel}` : ''}`
    : null;
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
      <View style={[styles.edge, { backgroundColor: statusEdgeColor(job) }]} />
      <View style={styles.header}>
        <View style={styles.refBlock}>
          <Text style={styles.ref}>#{job.refNumber}</Text>
          <Text style={styles.serviceLine} numberOfLines={1}>
            {serviceLabel}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <StatusBadge status={job.status} />
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>
      </View>

      <Text style={styles.customer} numberOfLines={1}>
        {job.customerName}
      </Text>

      <Text style={styles.address} numberOfLines={2}>
        {job.addressLine}
      </Text>

      <View style={styles.metaGrid}>
        <MetaChip icon="calendar-outline" label={scheduledLabel} />
        <MetaChip icon="disc-outline" label={job.tyreSizeDisplay} />
        <MetaChip icon="cash-outline" label={totalLabel} />
      </View>

      {payment && paymentDisplay && paymentColors && (
        <View
          style={[
            styles.paymentChip,
            {
              backgroundColor: paymentColors.bg,
              borderColor: paymentColors.border,
            },
          ]}
        >
          <Ionicons name={paymentIcon(paymentDisplay.tone)} size={14} color={paymentColors.text} />
          <Text style={[styles.paymentChipText, { color: paymentColors.text }]} numberOfLines={1}>
            {paymentLabel}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    paddingLeft: spacing.lg + spacing.xs,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    ...cardShadow,
  },
  edge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  refBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ref: {
    color: colors.accent,
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.sm,
  },
  serviceLine: {
    color: colors.muted,
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  customer: {
    color: colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.lg,
    marginBottom: 2,
  },
  address: {
    color: colors.muted,
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metaChip: {
    minHeight: 28,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  metaChipText: {
    color: colors.muted,
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    flexShrink: 1,
  },
  paymentChip: {
    marginTop: spacing.sm,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  paymentChipText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.xs,
    flexShrink: 1,
  },
});
