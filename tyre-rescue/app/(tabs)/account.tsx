import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { customerInvoiceUrl } from '@/src/api';
import {
  humanBookingStatus,
  useCustomerAccount,
  type CustomerBookingSummary,
} from '@/src/customer-account';
import { colors, spacing, typography } from '@/src/theme';
import { formatPrice } from '@/src/types';
import { Card, InlineNotice, LoadingState, Logo, PrimaryButton, Row, ScreenHeader, TextField, useScreenContentInsets } from '@/src/ui';

export default function AccountScreen() {
  const account = useCustomerAccount();
  const safeContentInsets = useScreenContentInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleLogin() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await account.login({ email, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }
    setForgotBusy(true);
    setError(null);
    setMessage(null);
    try {
      const nextMessage = await account.forgotPassword(email.trim().toLowerCase());
      setMessage(nextMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset link.');
    } finally {
      setForgotBusy(false);
    }
  }

  if (account.loading) {
    return (
      <View style={styles.loadingScreen}>
        <LoadingState label="Loading account..." />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, safeContentInsets]} keyboardShouldPersistTaps="handled">
      <Logo />
      <ScreenHeader eyebrow="Account" title={account.profile ? 'Your account' : 'Sign in'} />

      {account.profile ? (
        <>
          <Card>
            <Row label="Name" value={account.profile.name} />
            <Row label="Email" value={account.profile.email} />
            {account.profile.phone ? <Row label="Phone" value={account.profile.phone} /> : null}
          </Card>

          <View style={styles.actionRow}>
            <PrimaryButton icon="plus" style={styles.actionButton} onPress={() => router.push('/')}>
              New booking
            </PrimaryButton>
            <PrimaryButton icon="refresh-cw" variant="secondary" style={styles.actionButton} onPress={account.refresh}>
              Refresh
            </PrimaryButton>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bookings</Text>
            {account.bookings.length > 0 ? (
              account.bookings.map((booking) => (
                <BookingCard key={booking.refNumber} booking={booking} />
              ))
            ) : (
              <Card>
                <Text style={styles.mutedText}>No bookings yet.</Text>
              </Card>
            )}
          </View>

          <PrimaryButton icon="log-out" variant="secondary" onPress={account.logout}>
            Sign out
          </PrimaryButton>
        </>
      ) : (
        <>
          <Card>
            <TextField label="Email" value={email} onChangeText={setEmail} placeholder="john@example.com" keyboardType="email-address" autoComplete="email" />
            <TextField label="Password" value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry autoComplete="password" />
          </Card>
          {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}
          {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
          <PrimaryButton icon="log-in" loading={busy} disabled={!email || !password} onPress={handleLogin}>
            Sign in
          </PrimaryButton>
          <PrimaryButton icon="key" variant="secondary" loading={forgotBusy} disabled={!email} onPress={handleForgotPassword}>
            Forgot password
          </PrimaryButton>
        </>
      )}
    </ScrollView>
  );
}

function BookingCard({ booking }: { booking: CustomerBookingSummary }) {
  const date = booking.scheduledAt || booking.createdAt;
  const vehicle =
    [booking.vehicleReg, booking.vehicleMake, booking.vehicleModel]
      .filter(Boolean)
      .join(' ') || booking.tyreSizeDisplay;

  return (
    <Card style={styles.bookingCard}>
      <View style={styles.bookingHeader}>
        <View>
          <Text style={styles.refText}>{booking.refNumber}</Text>
          <Text style={styles.statusText}>{humanBookingStatus(booking.status)}</Text>
        </View>
        <Text style={styles.priceText}>{formatPrice(booking.totalAmount)}</Text>
      </View>
      <Row label="Service" value={`${humanBookingStatus(booking.bookingType)} ${humanBookingStatus(booking.serviceType)}`} />
      {vehicle ? <Row label="Vehicle" value={vehicle} /> : null}
      <Row label="Address" value={booking.addressLine} />
      {date ? <Row label="Date" value={new Date(date).toLocaleString('en-GB')} /> : null}
      <View style={styles.bookingActions}>
        <PrimaryButton
          icon="map-pin"
          variant="secondary"
          style={styles.bookingButton}
          onPress={() => router.push({ pathname: '/track', params: { ref: booking.refNumber } })}
        >
          Track
        </PrimaryButton>
        <PrimaryButton icon="plus" style={styles.bookingButton} onPress={() => router.push('/')}>
          Book again
        </PrimaryButton>
      </View>
      {booking.invoiceDownloadToken ? (
        <PrimaryButton
          icon="download"
          variant="secondary"
          onPress={() => Linking.openURL(customerInvoiceUrl(booking.refNumber, booking.invoiceDownloadToken!))}
        >
          Download invoice
        </PrimaryButton>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.bg,
    gap: 16,
    minHeight: '100%',
    padding: spacing.page,
    paddingBottom: 42,
  },
  loadingScreen: {
    backgroundColor: colors.bg,
    flex: 1,
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 17,
  },
  bookingCard: {
    gap: 8,
  },
  bookingHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  refText: {
    color: colors.accent,
    fontFamily: typography.bodyBold,
    fontSize: 15,
  },
  statusText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: 2,
  },
  priceText: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
  },
  bookingActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  bookingButton: {
    flex: 1,
  },
  mutedText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    textAlign: 'center',
  },
});
