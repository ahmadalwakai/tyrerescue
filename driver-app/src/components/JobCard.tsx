import { useRef } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors, spacing, fontSize, radius, cardShadow } from '@/constants/theme';
import { AnimatedPressable } from './AnimatedPressable';
import { StatusBadge } from './StatusBadge';
import { DriverPaymentCard } from './DriverPaymentCard';
import { lightHaptic } from '@/services/haptics';
import type { JobSummary } from '@/api/client';
import { useI18n } from '@/i18n';
import { formatJobTyreLinesSummary } from '@/lib/tyre-lines';

interface JobCardProps { job: JobSummary; onPress: () => void }

export function JobCard({ job, onPress }: JobCardProps) {
  const { t, dateLocale } = useI18n();
  const router = useRouter();
  const navLockRef = useRef(false);
  const terminal = ['completed', 'cancelled', 'cancelled_refund_pending', 'refunded', 'refunded_partial'].includes(job.status);
  const service = job.serviceType === 'mobile_fitting' ? t('jobs.fitting') : t('jobs.emergency');
  const tyreSummary = formatJobTyreLinesSummary(job);
  const date = job.scheduledAt ? new Date(job.scheduledAt) : null;
  const scheduled = date && Number.isFinite(date.getTime())
    ? format(date, 'dd MMM, HH:mm', { locale: dateLocale }) : null;
  const openOnce = (action: () => void) => {
    if (navLockRef.current) return;
    navLockRef.current = true;
    setTimeout(() => { navLockRef.current = false; }, 800);
    lightHaptic();
    action();
  };
  const phone = job.customerPhone?.replace(/[^+\d]/g, '') ?? '';

  return (
    <View style={styles.card}>
      <View style={[styles.edge, { backgroundColor: job.status === 'completed' ? colors.success : terminal ? colors.danger : colors.navigation }]} />
      <AnimatedPressable
        onPress={() => openOnce(onPress)}
        style={styles.content}
        accessibilityRole="button"
        accessibilityLabel={`${t('driverUi.openJob')} ${job.refNumber}, ${job.customerName}`}
      >
        <View style={styles.header}>
          <View style={styles.refBlock}>
            <Text style={styles.reference}>#{job.refNumber} · {service}</Text>
            <Text style={styles.customer} numberOfLines={1}>{job.customerName}</Text>
          </View>
          <StatusBadge status={job.status} />
        </View>
        <View style={styles.addressRow}>
          <Ionicons name="location" size={19} color={colors.navigation} />
          <Text style={styles.address} numberOfLines={3}>{job.addressLine || t('driverUi.locationMissing')}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>
        <View style={styles.meta}>
          {scheduled && <Text style={styles.metaText}>{scheduled}</Text>}
          {tyreSummary && <Text style={styles.metaText} numberOfLines={2}>{tyreSummary}</Text>}
        </View>
      </AnimatedPressable>
      <View style={styles.payment}><DriverPaymentCard payment={job.paymentSummary ?? job.payment} compact /></View>
      {!terminal && (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('driverUi.navigate')} ${job.customerName}`}
            style={({ pressed }) => [styles.action, styles.navigate, pressed && styles.pressed]}
            onPress={() => openOnce(() => router.push(`/(tabs)/jobs/${job.refNumber}/route`))}
          >
            <Ionicons name="navigate" size={20} color={colors.white} />
            <Text style={styles.actionText}>{t('driverUi.navigate')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('driverUi.callCustomer')} ${job.customerName}`}
            accessibilityState={{ disabled: !phone }}
            disabled={!phone}
            style={({ pressed }) => [styles.action, styles.call, (!phone || pressed) && styles.pressed]}
            onPress={() => { void Linking.openURL(`tel:${phone}`).catch(() => onPress()); }}
          >
            <Ionicons name="call-outline" size={20} color={colors.text} />
            <Text style={styles.actionText}>{t('driverUi.callCustomer')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xxl, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md, overflow: 'hidden', ...cardShadow },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  content: { padding: spacing.lg, paddingBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md },
  refBlock: { flex: 1, minWidth: 0 },
  reference: { color: colors.muted, fontSize: fontSize.xs, fontFamily: 'Inter_600SemiBold', marginBottom: 5 },
  customer: { color: colors.text, fontSize: 20, fontFamily: 'Inter_700Bold' },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  address: { flex: 1, color: colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 16, lineHeight: 24 },
  meta: { gap: 6, marginTop: spacing.md },
  metaText: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: fontSize.sm, lineHeight: 20 },
  payment: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  action: { flex: 1, minHeight: 50, padding: spacing.sm, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  navigate: { backgroundColor: colors.navigation },
  call: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  actionText: { color: colors.text, fontSize: fontSize.base, fontFamily: 'Inter_700Bold', flexShrink: 1, textAlign: 'center' },
  pressed: { opacity: 0.6 },
});
