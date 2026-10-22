import { StyleSheet, Text, View } from 'react-native';
import { useDriverLocationShare } from '../../hooks/useDriverLocationShare';
import { AppButton, StatusBanner } from '../ui';
import { colors, fontSize, radius, space } from '../theme';

interface Props {
  bookingRef: string | null | undefined;
  bookingId?: string | null;
  /** Saved customer details are always fetched again before opening WhatsApp. */
  customerPhone?: string | null;
  compact?: boolean;
}

export function DriverLocationShareActions({ bookingRef, bookingId, compact = false }: Props) {
  const actions = useDriverLocationShare({ bookingRef, bookingId });
  if (!bookingRef) return null;
  return (
    <View style={[styles.container, compact && styles.compact]} testID="driver-location-share-actions">
      <Text style={styles.title}>Share driver location</Text>
      <Text style={styles.hint}>Send the customer a map pin of the driver’s latest position.</Text>
      <View style={styles.buttons}>
        <AppButton
          label="Copy driver location"
          variant="secondary"
          onPress={() => { void actions.copy(); }}
          loading={actions.busy === 'copy'}
          disabled={actions.busy !== null}
          fullWidth
          accessibilityLabel="Copy driver location link"
        />
        <AppButton
          label="WhatsApp driver location"
          variant="secondary"
          onPress={() => { void actions.whatsapp(); }}
          loading={actions.busy === 'whatsapp'}
          disabled={actions.busy !== null}
          fullWidth
          accessibilityLabel="Send driver location to customer via WhatsApp"
        />
      </View>
      {actions.notice ? <StatusBanner kind={actions.notice.kind} message={actions.notice.text} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  compact: { marginTop: space.sm },
  title: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: fontSize.sm, lineHeight: 19 },
  buttons: { gap: space.sm },
});
