import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { customerInvoiceUrl } from './api';
import type { useCustomerAccount, CustomerBookingSummary } from './customer-account';
import { shareCustomerInvoice } from './customer-invoice-file';
import { customerInvoices, invoiceDate } from './customer-invoices-data';
import { colors, spacing, typography } from './theme';
import { formatPrice } from './types';
import { AppHeader, Card, InlineNotice, LoadingState, PrimaryButton, Row, ScreenHeader, TextField, useScreenContentInsets } from './ui';

type InvoiceAccount = Pick<ReturnType<typeof useCustomerAccount>, 'bookings' | 'profile' | 'token' | 'loading' | 'refreshing' | 'offline' | 'connectionError' | 'refresh'>;

export function CustomerInvoices({ account }: { account: InvoiceAccount }) {
  const insets = useScreenContentInsets();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const alive = useRef(false);
  const working = useRef(false);
  const sessionScope = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const currentAccount = useRef(account);
  currentAccount.current = account;
  const { refresh, token, profile } = account;
  const ownerId = profile?.id;
  useFocusEffect(useCallback(() => {
    const scope = sessionScope;
    scope.current++;
    alive.current = true;
    working.current = false;
    controller.current = null;
    setBusy(null); setError(''); setMessage('');
    if (token && ownerId) void refresh();
    return () => { alive.current = false; scope.current++; controller.current?.abort(); };
  }, [refresh, token, ownerId]));

  async function act(booking: CustomerBookingSummary, share: boolean) {
    const latest = currentAccount.current;
    if (working.current || !alive.current || !latest.token || !latest.profile || latest.offline || latest.connectionError || latest.loading || latest.refreshing) return;
    const invoice = latest.bookings.find(item => item.bookingId === booking.bookingId && item.refNumber === booking.refNumber && item.invoiceDownloadToken);
    if (!invoice?.invoiceDownloadToken) return;
    const requestedToken = latest.token;
    const owner = latest.profile.id;
    const revision = sessionScope.current;
    const current = () => alive.current && sessionScope.current === revision && currentAccount.current.token === requestedToken && currentAccount.current.profile?.id === owner;
    working.current = true; setBusy(invoice.refNumber); setError(''); setMessage('');
    const request = new AbortController(); controller.current = request;
    try {
      if (share) {
        const result = await shareCustomerInvoice({ refNumber: invoice.refNumber, token: requestedToken, signal: request.signal });
        if (current() && result === 'downloaded') setMessage('PDF download started. You can share the downloaded file from your browser.');
      } else {
        await Linking.openURL(customerInvoiceUrl(invoice.refNumber, invoice.invoiceDownloadToken));
      }
    } catch {
      if (current() && !request.signal.aborted) setError(share ? 'Unable to share this PDF. Refresh your invoices and try again, or use Download PDF.' : 'Unable to open this PDF. Refresh your invoices and try again.');
    } finally {
      if (controller.current === request) { working.current = false; controller.current = null; }
      if (current()) setBusy(null);
    }
  }

  const signedIn = Boolean(account.token && account.profile);
  const all = signedIn ? customerInvoices(account.bookings) : [];
  const invoices = customerInvoices(all, query);
  const disabled = Boolean(busy || account.refreshing || account.offline || account.connectionError);
  return <ScrollView contentContainerStyle={[styles.content, insets]} keyboardShouldPersistTaps="handled">
    <AppHeader onBack={() => router.canGoBack() ? router.back() : router.replace('/account')} />
    <ScreenHeader title="My invoices" detail="Find, download and share your paid booking invoices." />
    {account.loading ? <LoadingState label="Loading your account…" /> : !signedIn ? <Card>
      <Text style={styles.muted}>Sign in to see the invoices for bookings linked to your account.</Text>
      <PrimaryButton icon="log-in" onPress={() => router.push('/account')}>Open my account</PrimaryButton>
    </Card> : <>
      <PrimaryButton icon="refresh-cw" variant="secondary" loading={account.refreshing} disabled={Boolean(busy)} onPress={() => { setError(''); setMessage(''); void account.refresh(); }}>Refresh invoices</PrimaryButton>
      {account.offline || account.connectionError ? <InlineNotice>{account.offline ? 'Connect to the internet to load and download your invoices.' : 'Your invoices could not be refreshed. Try again to get the latest availability.'}</InlineNotice> : null}
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {message ? <InlineNotice tone="accent">{message}</InlineNotice> : null}
      {all.length ? <>
        <TextField label="Search invoices" placeholder="Booking reference, vehicle or date" value={query} onChangeText={setQuery} maxLength={100} autoCorrect={false} />
        <Text style={styles.muted} accessibilityLiveRegion="polite">{invoices.length} invoice{invoices.length === 1 ? '' : 's'}{query.trim() ? ' found' : ''}</Text>
      </> : null}
      {account.refreshing && !all.length ? <LoadingState label="Loading invoices…" /> : !all.length ? <Card>
        <Text style={styles.heading}>{account.offline || account.connectionError ? 'Invoices are unavailable right now' : 'No invoices available yet'}</Text>
        <Text style={styles.muted}>{account.offline || account.connectionError ? 'Refresh when connected to retrieve your paid booking invoices.' : 'Invoices appear after payment is fully settled. Only bookings linked to this account are listed.'}</Text>
      </Card> : !invoices.length ? <Card>
        <Text style={styles.muted}>No invoices match your search.</Text>
        <PrimaryButton variant="ghost" onPress={() => setQuery('')}>Clear search</PrimaryButton>
      </Card> : invoices.map(invoice => <Card key={invoice.bookingId}>
        <View style={styles.invoiceHeading}>
          <Text style={styles.heading} accessibilityRole="header">INV-{invoice.refNumber}</Text>
          <Text style={styles.price}>{formatPrice(invoice.totalAmount)}</Text>
        </View>
        <Row label="Booking date" value={invoiceDate(invoice.createdAt)} />
        <Row label="Service" value={invoice.serviceType.replace(/_/g, ' ')} />
        {[invoice.vehicleReg, invoice.vehicleMake, invoice.vehicleModel].some(Boolean) ? <Row label="Vehicle" value={[invoice.vehicleReg, invoice.vehicleMake, invoice.vehicleModel].filter(Boolean).join(' · ')} /> : null}
        <PrimaryButton icon="download" variant="secondary" disabled={disabled} onPress={() => void act(invoice, false)} accessibilityLabel={`Download invoice ${invoice.refNumber}`}>Download PDF</PrimaryButton>
        <PrimaryButton icon="share-2" variant="ghost" disabled={disabled} loading={busy === invoice.refNumber} onPress={() => void act(invoice, true)} accessibilityLabel={`Share invoice ${invoice.refNumber}`}>Share PDF</PrimaryButton>
      </Card>)}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { backgroundColor: colors.bg, padding: spacing.page, gap: 16, flexGrow: 1 },
  heading: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 17, flexShrink: 1 },
  muted: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  invoiceHeading: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  price: { color: colors.accent, fontFamily: typography.bodyBold, fontSize: 20 },
});
