import { StyleSheet, Text, View } from 'react-native';
import type { DuplicateBookingMatch } from '@/hooks/useDuplicateBookingWarning';
import { AppButton } from './ui';
import { colors, fontSize, radius } from './theme';

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

interface Props {
  match: DuplicateBookingMatch | null;
  /** Set to true once the operator clicks "Continue anyway" so we hide. */
  acknowledged: boolean;
  onReview: () => void;
  onContinueAnyway: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return TIME_FMT.format(d);
}

export function DuplicateBookingWarning({ match, acknowledged, onReview, onContinueAnyway }: Props) {
  if (!match || acknowledged) return null;
  const time = formatTime(match.whenIso);
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>
        Possible duplicate booking from {time}. Check before continuing.
      </Text>
      {match.bookingReference ? (
        <Text style={styles.meta}>Reference: {match.bookingReference}</Text>
      ) : null}
      {match.customerAddress ? (
        <Text style={styles.meta} numberOfLines={2}>
          {match.customerAddress}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <AppButton label="Review" variant="secondary" onPress={onReview} fullWidth />
        <AppButton
          label="Continue anyway"
          variant="ghost"
          onPress={onContinueAnyway}
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    padding: 10,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.warningBg,
    gap: 6,
  },
  title: { color: colors.warning, fontSize: fontSize.sm, fontWeight: '700' },
  meta: { color: colors.warning, fontSize: fontSize.xs },
  actions: { gap: 6, marginTop: 6 },
});
