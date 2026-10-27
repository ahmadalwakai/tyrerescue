import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { useDriverJourneys } from '@/hooks/useDriverJourneys';
import { canDecideDriverJourney, driverJourneyTitle } from '@/types/driver-journeys';
import { formatBookingAlertDate } from '@/types/new-customer-booking-alerts';
import { AdminModalHeader, AdminModalShell } from '../layout/AdminModalShell';
import { AppButton, StatusBanner } from '../ui';
import { colors, fontSize, radius, space } from '../theme';

export function DriverJourneysModal({ journeys }: { journeys: ReturnType<typeof useDriverJourneys> }) {
  const [now, setNow] = useState(Date.now);
  const selected = journeys.items.find((item) => item.eventId === journeys.selectedEventId);
  useEffect(() => {
    if (!journeys.visible) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [journeys.visible]);
  const selectedEventId = selected?.eventId;
  const needsRead = Boolean(journeys.visible && selected && !selected.isRead && selected.kind !== 'confirmation');
  const markRead = journeys.markRead;
  useEffect(() => { if (selectedEventId && needsRead) void markRead(selectedEventId); }, [selectedEventId, needsRead, markRead]);
  const canDecide = selected && canDecideDriverJourney(selected, now) && !journeys.loading && !journeys.error;
  return (
    <Modal visible={journeys.visible} animationType="slide" onRequestClose={journeys.close}>
      <AdminModalShell>
        <AdminModalHeader title="Driver journeys" subtitle="Confirm inferred journeys and review updates" onClose={journeys.busy ? undefined : journeys.close} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppButton label={journeys.loading ? 'Refreshing…' : 'Refresh journeys'} onPress={() => { void journeys.refresh(); }} disabled={journeys.busy || journeys.loading} variant="secondary" />
          {journeys.error ? <StatusBanner kind="err" message={journeys.error} /> : null}
          {selected ? (
            <View style={styles.card} accessibilityLiveRegion="polite">
              <Text style={styles.title}>{driverJourneyTitle(selected)}</Text>
              <Text style={styles.text}>Driver: {selected.driverName}</Text>
              <Text style={styles.text}>Booking: #{selected.refNumber} · {selected.customerName || 'Customer'}</Text>
              <Text style={styles.text}>Location: {selected.locationLabel || 'See booking details'}</Text>
              <Text style={styles.text}>Status: {selected.status}</Text>
              {selected.etaSeconds !== null ? <Text style={styles.text}>ETA: {Math.max(1, Math.ceil(selected.etaSeconds / 60))} min</Text> : null}
              {selected.lastLocationAt ? <Text style={styles.meta}>GPS updated: {formatBookingAlertDate(selected.lastLocationAt)} (UK time)</Text> : null}
              {selected.kind === 'confirmation' ? (
                <>
                  <Text style={styles.text}>Is this driver heading to this customer? Confirm only when this matches your dispatch.</Text>
                  <Text style={styles.meta}>This confirms monitoring for the journey and does not assign the booking.</Text>
                  <Text style={styles.meta}>Expires: {formatBookingAlertDate(selected.expiresAt)} (UK time)</Text>
                  {!canDecideDriverJourney(selected, now) ? <StatusBanner kind="info" message="This confirmation has expired or already been answered." /> : null}
                  {!canDecideDriverJourney(selected, now) ? <AppButton label="Mark as read" onPress={() => { void journeys.markRead(selected.eventId); }} disabled={selected.isRead || journeys.busy} variant="secondary" /> : null}
                  <AppButton label="Yes, confirm this journey" onPress={() => { void journeys.decide(selected.eventId, 'yes'); }} disabled={!canDecide || journeys.busy} loading={journeys.busy} />
                  <AppButton label="No, this is not the journey" onPress={() => { void journeys.decide(selected.eventId, 'no'); }} disabled={!canDecide || journeys.busy} variant="secondary" />
                </>
              ) : (
                <AppButton label="Mark as read" onPress={() => { void journeys.markRead(selected.eventId); }} disabled={selected.isRead || journeys.busy} variant="secondary" />
              )}
            </View>
          ) : journeys.selectedEventId && !journeys.loading ? <StatusBanner kind="info" message="This journey event is no longer available. Refresh to see current updates." /> : null}
          <Text style={styles.title}>Recent journey alerts</Text>
          {journeys.items.length === 0 && !journeys.loading ? <Text style={styles.meta}>No driver journey alerts.</Text> : null}
          {journeys.items.map((item) => (
            <View key={item.eventId} style={styles.card}>
              <Text style={styles.title}>{!item.isRead ? '● ' : ''}{driverJourneyTitle(item)}</Text>
              <Text style={styles.text}>{item.driverName} · #{item.refNumber}</Text>
              <Text style={styles.meta}>{item.customerName || 'Customer'} · {item.locationLabel || 'Location in booking'}</Text>
              <Text style={styles.meta}>{item.status} · {formatBookingAlertDate(item.createdAt)} (UK time)</Text>
              <AppButton label={item.kind === 'confirmation' ? 'Review confirmation' : 'View update'} onPress={() => journeys.select(item.eventId)} disabled={journeys.busy} variant="secondary" />
            </View>
          ))}
        </ScrollView>
      </AdminModalShell>
    </Modal>
  );
}
const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: space.xxl },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md, gap: space.sm },
  title: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  text: { color: colors.text, fontSize: fontSize.sm },
  meta: { color: colors.muted, fontSize: fontSize.sm },
});
