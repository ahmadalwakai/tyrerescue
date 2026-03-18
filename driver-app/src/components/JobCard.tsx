import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, fontSize, radius } from '@/constants/theme';
import { StatusBadge } from './StatusBadge';
import { format } from 'date-fns';
import type { JobSummary } from '@/api/client';

interface JobCardProps {
  job: JobSummary;
  onPress: () => void;
}

export function JobCard({ job, onPress }: JobCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
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
          {job.serviceType === 'mobile_fitting' ? 'Fitting' : 'Emergency'}
        </Text>
        {job.scheduledAt && (
          <Text style={styles.meta}>
            {format(new Date(job.scheduledAt), 'dd MMM, HH:mm')}
          </Text>
        )}
        {job.tyreSizeDisplay && (
          <Text style={styles.meta}>{job.tyreSizeDisplay}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.85,
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
});
