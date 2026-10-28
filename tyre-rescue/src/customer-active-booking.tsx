import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { useCustomerAccount } from './customer-account';
import { customerActiveBookingDate, customerActiveBookingStatus, selectCustomerActiveBooking } from './customer-active-booking-state';
import { colors, spacing, typography } from './theme';
import { Card, Pill, PrimaryButton } from './ui';

/** Place before the booking form on the Book tab. Routes use the signed-in customer's own booking. */
export function CustomerActiveBookingCard() {
  const account = useCustomerAccount();
  const { loading, token, refresh } = account;
  const customerId = account.profile?.id;

  useFocusEffect(useCallback(() => {
    if (loading || !token || !customerId) return;

    let previousState = AppState.currentState;
    if (previousState === 'active') void refresh();
    const subscription = AppState.addEventListener('change', (nextState) => {
      const returnedToApp = nextState === 'active' && previousState !== 'active';
      previousState = nextState;
      if (returnedToApp) void refresh();
    });
    return () => subscription.remove();
  }, [loading, token, customerId, refresh]));

  if (account.loading || !account.token || !account.profile) return null;

  const booking = selectCustomerActiveBooking(account.bookings);
  if (!booking) return null;

  const appointment = booking.bookingType === 'scheduled' ? customerActiveBookingDate(booking.scheduledAt) : null;
  const savedDetails = account.offline || Boolean(account.connectionError);

  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Text accessibilityRole="header" style={styles.title}>Your active booking</Text>
          <Text selectable style={styles.reference}>{booking.refNumber}</Text>
        </View>
        <Pill tone="accent">{customerActiveBookingStatus(booking.status)}</Pill>
      </View>
      <View style={styles.details}>
        <Text style={styles.bookingType}>{booking.bookingType === 'emergency' ? 'Emergency booking' : 'Scheduled booking'}</Text>
        {appointment ? <Text style={styles.detail}>Appointment: {appointment} (UK time)</Text> : null}
        {booking.addressLine ? <Text style={styles.detail}>{booking.addressLine}</Text> : null}
      </View>
      {savedDetails ? (
        <View accessibilityLiveRegion="polite" style={styles.savedNotice}>
          <Text style={styles.savedText}>Showing saved booking details. Your booking status may have changed. Connect to get the latest tracking and messages.</Text>
          <PrimaryButton icon="refresh-cw" variant="ghost" loading={account.refreshing} onPress={() => void account.refresh()}>Refresh booking</PrimaryButton>
        </View>
      ) : null}
      <View style={styles.actions}>
        <PrimaryButton
          icon="map-pin"
          style={styles.action}
          accessibilityLabel={`Track booking ${booking.refNumber}`}
          onPress={() => router.push({ pathname: '/track', params: { ref: booking.refNumber } })}
        >Track</PrimaryButton>
        <PrimaryButton
          icon="message-circle"
          variant="secondary"
          style={styles.action}
          accessibilityLabel={`Chat with our team about booking ${booking.refNumber}`}
          onPress={() => router.push({ pathname: '/chat', params: { bookingId: booking.bookingId, ref: booking.refNumber } })}
        >Chat</PrimaryButton>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: colors.accentBorder, gap: spacing.gap },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.gap },
  headingText: { flexGrow: 1, gap: 4 },
  title: { color: colors.text, fontFamily: typography.heading, fontSize: 18, lineHeight: 26 },
  reference: { color: colors.accent, fontFamily: typography.bodyBold, fontSize: 15, lineHeight: 22 },
  details: { gap: 5 },
  bookingType: { color: colors.text, fontFamily: typography.bodyMedium, fontSize: 15, lineHeight: 22 },
  detail: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  savedNotice: { gap: 4 },
  savedText: { color: colors.warning, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
});
