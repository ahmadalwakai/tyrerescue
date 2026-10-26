import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton, SectionCard } from './ui';
import { colors, fontSize, radius, space } from './theme';
import { CONFIDENCE_LABELS } from '@/lib/returning-customer';
import type { ReturningCustomerBooking, ReturningCustomerMatch } from '@/types/assisted-chat';

interface Props {
  matches: ReturningCustomerMatch[];
  loading: boolean;
  onUse: (match: ReturningCustomerMatch) => void;
  onDismiss: (match: ReturningCustomerMatch) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function vehicleText(booking: ReturningCustomerBooking): string | null {
  const parts = [booking.vehicleReg, [booking.vehicleMake, booking.vehicleModel].filter(Boolean).join(' ')].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function paymentText(booking: ReturningCustomerBooking): string | null {
  const total = booking.totalAmount !== null && Number.isFinite(Number(booking.totalAmount)) ? `£${Number(booking.totalAmount).toFixed(2)}` : null;
  const parts = [booking.paymentType, total].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function BookingSummary({ booking }: { booking: ReturningCustomerBooking }) {
  const vehicle = vehicleText(booking);
  const payment = paymentText(booking);
  const tyre = booking.tyreSize ? `${booking.tyreSize}${booking.quantity ? ` × ${booking.quantity}` : ''}` : null;
  return (
    <View style={styles.booking}>
      <Text style={styles.bookingTitle} selectable>#{booking.refNumber} · {formatDate(booking.createdAt)} · {booking.status}</Text>
      {booking.addressLine ? <Text style={styles.detail} numberOfLines={2}>{booking.addressLine}</Text> : null}
      {vehicle ? <Text style={styles.detail}>Vehicle: {vehicle}</Text> : null}
      {tyre ? <Text style={styles.detail}>Tyres: {tyre}</Text> : null}
      {booking.lockingNutStatus ? <Text style={styles.detail}>Locking nut: {booking.lockingNutStatus.replace(/_/g, ' ')}</Text> : null}
      {payment ? <Text style={styles.detail}>Payment: {payment}</Text> : null}
    </View>
  );
}

/**
 * Shows server-matched history for the typed number. Nothing is copied into
 * the draft until the operator taps "Use details", and then only into empty
 * fields. Low-confidence matches are labelled as needing a check.
 */
export function ReturningCustomerCard({ matches, loading, onUse, onDismiss }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  if (matches.length === 0) {
    return loading ? (
      <View style={styles.loadingRow} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.detail}>Checking customer history…</Text>
      </View>
    ) : null;
  }
  const match = matches.find((item) => item.key === selectedKey) ?? matches[0];
  const review = match.confidence === 'review';
  const [latest, ...older] = match.bookings;

  return (
    <SectionCard title="Customer history">
      <View accessibilityLiveRegion="polite" style={styles.stack}>
        <View style={[styles.badge, review ? styles.badgeReview : styles.badgeMatch]}>
          <Text style={[styles.badgeText, review ? styles.badgeTextReview : styles.badgeTextMatch]}>{CONFIDENCE_LABELS[match.confidence]}</Text>
        </View>
        <Text style={styles.name}>
          {match.customer.name || 'Unnamed customer'} · {match.bookingCount} previous booking{match.bookingCount === 1 ? '' : 's'}
        </Text>
        <Text style={styles.reason}>{match.reasons.join(' · ')}</Text>
        {latest ? <BookingSummary booking={latest} /> : null}
        {older.length > 0 ? (
          <Pressable
            onPress={() => setExpanded((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            style={styles.linkButton}
          >
            <Text style={styles.link}>{expanded ? 'Hide earlier bookings' : `Show earlier bookings (${older.length})`}</Text>
          </Pressable>
        ) : null}
        {expanded ? older.map((booking) => <BookingSummary key={booking.refNumber} booking={booking} />) : null}
        {matches.length > 1 ? (
          <View style={styles.others}>
            <Text style={styles.detail}>Other records found ({matches.length - 1}). They are kept separate:</Text>
            <View style={styles.chips}>
              {matches.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => { setSelectedKey(item.key); setExpanded(false); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.key === match.key }}
                  style={[styles.chip, item.key === match.key && styles.chipActive]}
                >
                  <Text style={styles.chipText} numberOfLines={1}>{item.customer.name || 'Unnamed'} · {item.bookingCount}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        <AppButton label="Use details (empty fields only)" onPress={() => onUse(match)} />
        <AppButton label="Not this customer" variant="secondary" onPress={() => onDismiss(match)} />
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgeMatch: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
  badgeReview: { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
  badgeText: { fontSize: fontSize.xs, fontWeight: '800' },
  badgeTextMatch: { color: colors.success },
  badgeTextReview: { color: colors.warning },
  name: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  reason: { color: colors.muted, fontSize: fontSize.sm },
  booking: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.sm, gap: 2, backgroundColor: colors.cardMuted },
  bookingTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  detail: { color: colors.muted, fontSize: fontSize.sm },
  linkButton: { minHeight: 44, justifyContent: 'center' },
  link: { color: colors.accent, fontSize: fontSize.sm, fontWeight: '700' },
  others: { gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, maxWidth: '100%' },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
});
