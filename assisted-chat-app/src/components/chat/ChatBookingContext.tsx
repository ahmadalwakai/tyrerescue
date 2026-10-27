import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../ui';
import { colors, fontSize, radius, space } from '../theme';

/**
 * Subset of GET /api/mobile/admin/bookings/[ref] (the same response the
 * bookings screen uses). Payment state is the server's paymentSummary, built
 * from recorded payment events: the client never infers payment from the
 * booking status.
 */
export interface ChatBookingContextData {
  booking: {
    refNumber: string;
    status: string;
    serviceType: string;
    addressLine: string;
    tyreDisplayLines?: string[];
    vehicleReg: string | null;
    lockingNutStatus: string | null;
    customerName: string;
    scheduledAt: string | null;
    totalAmount: string;
  };
  statusHistory: Array<{ id: string; toStatus: string; description: string | null; actorDisplayName: string; createdAt: string | null }>;
  assignedDriver: { name: string; isOnline: boolean | null } | null;
  paymentSummary?: {
    state: string;
    label: string;
    methodLabel: string;
    paidPence: number | null;
    totalPence: number | null;
    amountToCollectPence?: number | null;
    linkStatus?: string | null;
    isFullyPaid?: boolean;
  };
  invoice: { invoiceNumber: string; status: string } | null;
}

interface Props {
  bookingRef: string;
  data: ChatBookingContextData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenBooking?: (bookingRef: string) => void;
}

const money = (pence: number | null | undefined) => (typeof pence === 'number' ? `£${(pence / 100).toFixed(2)}` : null);
const words = (value: string | null | undefined) => (value ? value.replace(/_/g, ' ') : '');
function when(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ChatBookingContext({ bookingRef, data, loading, error, onRefresh, onOpenBooking }: Props) {
  const [expanded, setExpanded] = useState(false);
  const payment = data?.paymentSummary;
  const paid = payment?.isFullyPaid === true;
  const summary = data
    ? `${words(data.booking.status)}${payment ? ` · ${payment.label}` : ''}`
    : loading ? 'Loading booking…' : error ? 'Booking details unavailable' : '';

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Booking ${bookingRef}. ${summary}. ${expanded ? 'Hide' : 'Show'} booking details.`}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.rowCopy}>
          <Text style={styles.ref} numberOfLines={1} selectable>Booking #{bookingRef}</Text>
          <Text style={[styles.summary, paid && styles.paid]} numberOfLines={1}>{summary}</Text>
        </View>
        {loading && !data ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>}
      </Pressable>
      {expanded ? (
        <View style={styles.details}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {data ? (
            <>
              <Text style={styles.line}>{data.booking.customerName} · {words(data.booking.serviceType)}{data.booking.scheduledAt ? ` · ${when(data.booking.scheduledAt)}` : ''}</Text>
              <Text style={styles.line} numberOfLines={2}>{data.booking.addressLine}</Text>
              {data.booking.tyreDisplayLines?.length ? <Text style={styles.line}>Tyres: {data.booking.tyreDisplayLines.join(', ')}</Text> : null}
              {data.booking.vehicleReg ? <Text style={styles.line}>Vehicle: {data.booking.vehicleReg}</Text> : null}
              {data.booking.lockingNutStatus ? <Text style={styles.line}>Locking nut: {words(data.booking.lockingNutStatus)}</Text> : null}
              <Text style={styles.line}>
                Driver: {data.assignedDriver ? `${data.assignedDriver.name}${data.assignedDriver.isOnline ? ' (online)' : ''}` : 'Not assigned'}
              </Text>
              {payment ? (
                <View style={styles.block}>
                  <Text style={[styles.label, paid && styles.paid]}>Payment: {payment.label}</Text>
                  <Text style={styles.line}>
                    {[payment.methodLabel, money(payment.paidPence) && `paid ${money(payment.paidPence)}`, money(payment.totalPence) && `of ${money(payment.totalPence)}`].filter(Boolean).join(' · ')}
                  </Text>
                  {!paid && money(payment.amountToCollectPence) ? <Text style={styles.line}>To collect: {money(payment.amountToCollectPence)}</Text> : null}
                  {payment.linkStatus ? <Text style={styles.line}>Payment link: {words(payment.linkStatus)}</Text> : null}
                </View>
              ) : null}
              {data.invoice ? <Text style={styles.line}>Invoice {data.invoice.invoiceNumber} · {words(data.invoice.status)}</Text> : null}
              {data.statusHistory.length ? (
                <View style={styles.block}>
                  <Text style={styles.label}>Recent activity</Text>
                  {data.statusHistory.slice(-3).reverse().map((entry) => (
                    <Text key={entry.id} style={styles.line} numberOfLines={2}>
                      {when(entry.createdAt)} · {entry.description || words(entry.toStatus)} · {entry.actorDisplayName}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
          <View style={styles.actions}>
            {onOpenBooking ? <AppButton label="Open booking" onPress={() => onOpenBooking(bookingRef)} style={styles.action} /> : null}
            <AppButton label="Refresh" variant="secondary" onPress={onRefresh} loading={loading} disabled={loading} style={styles.action} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.xs },
  pressed: { opacity: 0.78 },
  rowCopy: { flex: 1, minWidth: 0 },
  ref: { color: colors.text, fontSize: fontSize.sm, fontWeight: '800' },
  summary: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '700' },
  paid: { color: colors.success },
  chevron: { color: colors.muted, fontSize: fontSize.xs },
  details: { paddingHorizontal: space.md, paddingBottom: space.sm, gap: 4 },
  line: { color: colors.muted, fontSize: fontSize.sm },
  label: { color: colors.text, fontSize: fontSize.sm, fontWeight: '800' },
  block: { marginTop: 4, gap: 2, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.cardMuted, borderWidth: 1, borderColor: colors.border },
  error: { color: colors.warning, fontSize: fontSize.sm, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  action: { flex: 1, minHeight: 44 },
});
