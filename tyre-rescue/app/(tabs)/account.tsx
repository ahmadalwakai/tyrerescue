import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { customerInvoiceUrl } from '@/src/api';
import {
  humanBookingStatus,
  useCustomerAccount,
  type CustomerBookingSummary,
} from '@/src/customer-account';
import { colors, spacing, typography } from '@/src/theme';
import { formatPrice } from '@/src/types';
import { Card, InlineNotice, LoadingState, Logo, PrimaryButton, Row, ScreenHeader, TextField, useScreenContentInsets } from '@/src/ui';

type AuthMode = 'login' | 'register';

const PASSWORD_RULES_MESSAGE = 'Password needs 8+ characters, one uppercase letter, one lowercase letter, and one number.';

export default function AccountScreen() {
  const account = useCustomerAccount();
  const safeContentInsets = useScreenContentInsets();
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function switchAuthMode(nextMode: AuthMode) {
    setAuthMode(nextMode);
    setError(null);
    setMessage(null);
  }

  function passwordMeetsRules(nextPassword: string) {
    return (
      nextPassword.length >= 8 &&
      /[A-Z]/.test(nextPassword) &&
      /[a-z]/.test(nextPassword) &&
      /[0-9]/.test(nextPassword)
    );
  }

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

  async function handleRegister() {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    if (trimmedName.length < 2) {
      setError('Enter your full name.');
      return;
    }
    if (!trimmedEmail) {
      setError('Enter your email address.');
      return;
    }
    if (!passwordMeetsRules(password)) {
      setError(PASSWORD_RULES_MESSAGE);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const payload = await account.register({
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone || null,
        password,
      });
      setPassword('');
      setConfirmPassword('');
      setMessage(payload.message || 'Account created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account.');
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
      <ScreenHeader
        eyebrow="Account"
        title={account.profile ? 'Your account' : authMode === 'login' ? 'Sign in' : 'Create account'}
        detail={account.profile ? undefined : 'Create an account or sign in to manage bookings, invoices, and tracking.'}
      />

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
          <View style={styles.authTabs}>
            <AuthTab label="Sign in" selected={authMode === 'login'} onPress={() => switchAuthMode('login')} />
            <AuthTab label="Create account" selected={authMode === 'register'} onPress={() => switchAuthMode('register')} />
          </View>
          <Card>
            {authMode === 'register' ? (
              <>
                <TextField label="Full name" value={name} onChangeText={setName} placeholder="John Smith" autoComplete="name" />
                <TextField label="Phone" value={phone} onChangeText={setPhone} placeholder="07123 456789" keyboardType="phone-pad" autoComplete="tel" />
              </>
            ) : null}
            <TextField label="Email" value={email} onChangeText={setEmail} placeholder="john@example.com" keyboardType="email-address" autoComplete="email" />
            <TextField label="Password" value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry autoComplete="password" />
            {authMode === 'register' ? (
              <>
                <TextField label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm password" secureTextEntry autoComplete="password-new" />
                <Text style={styles.passwordHelp}>{PASSWORD_RULES_MESSAGE}</Text>
              </>
            ) : null}
          </Card>
          {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}
          {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
          {authMode === 'login' ? (
            <>
              <PrimaryButton icon="log-in" loading={busy} disabled={!email || !password} onPress={handleLogin}>
                Sign in
              </PrimaryButton>
              <PrimaryButton icon="key" variant="secondary" loading={forgotBusy} disabled={!email} onPress={handleForgotPassword}>
                Forgot password
              </PrimaryButton>
            </>
          ) : (
            <PrimaryButton
              icon="user-plus"
              loading={busy}
              disabled={!name.trim() || !email.trim() || !password || !confirmPassword}
              onPress={handleRegister}
            >
              Create account
            </PrimaryButton>
          )}
        </>
      )}
    </ScrollView>
  );
}

function AuthTab({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.authTab,
        selected ? styles.authTabSelected : null,
        pressed ? styles.authTabPressed : null,
      ]}
    >
      <Text style={[styles.authTabText, selected ? styles.authTabTextSelected : null]}>{label}</Text>
    </Pressable>
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
  authTabs: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  authTab: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  authTabSelected: {
    backgroundColor: colors.accent,
  },
  authTabPressed: {
    opacity: 0.84,
  },
  authTabText: {
    color: colors.muted,
    flexShrink: 1,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    textAlign: 'center',
  },
  authTabTextSelected: {
    color: colors.bg,
  },
  passwordHelp: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
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
