import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCustomerAccount } from './customer-account';
import { CustomerAddressEditor } from './customer-address-editor';
import { newCustomerAddressId, useCustomerAddresses, type CustomerSavedAddress, type CustomerAddressInput } from './customer-addresses';
import { colors, spacing, typography } from './theme';
import { AppHeader, Card, InlineNotice, LoadingState, PrimaryButton, ScreenHeader, useScreenContentInsets } from './ui';

export function CustomerAddressBook() {
  const account = useCustomerAccount();
  const insets = useScreenContentInsets();
  return <ScrollView contentContainerStyle={[styles.screen, insets]} keyboardShouldPersistTaps="handled">
    <AppHeader onBack={() => router.canGoBack() ? router.back() : router.replace('/account')} />
    <ScreenHeader title="Saved addresses" detail="Keep Home, Work and other places ready for your next booking." />
    {account.loading ? <LoadingState label="Loading your account…" /> : !account.token || !account.profile ? <Card>
      <Text style={styles.detail}>Sign in to save addresses to your account.</Text>
      <PrimaryButton icon="log-in" onPress={() => router.push('/account')}>Sign in</PrimaryButton>
    </Card> : <AddressList key={JSON.stringify([account.profile.id, account.token, account.sessionRevision])} />}
  </ScrollView>;
}

function AddressList() {
  const book = useCustomerAddresses();
  const [editor, setEditor] = useState<{ id: string; initial?: CustomerSavedAddress } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function save(input: CustomerAddressInput) {
    if (!editor) return;
    if (editor.initial) await book.update(editor.id, input);
    else await book.create(editor.id, input);
    if (alive.current) { setEditor(null); setMessage('Address saved. You can choose it when making a booking.'); }
  }
  async function remove(id: string) {
    try {
      await book.remove(id);
      if (alive.current) { setDeleting(null); setMessage('Address removed. Existing bookings are unchanged.'); }
    } catch { /* The hook keeps the actionable error and the original address. */ }
  }

  if (editor) return <CustomerAddressEditor key={editor.id} initial={editor.initial} busy={book.busy} onSave={save} onCancel={() => setEditor(null)} />;
  return <View style={styles.content}>
    {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}
    {book.error ? <InlineNotice tone="danger">{book.error}</InlineNotice> : null}
    <PrimaryButton icon="plus" disabled={book.busy || book.loading || book.addresses.length >= 20} onPress={() => {
      setMessage(''); setDeleting(null); setEditor({ id: newCustomerAddressId() });
    }}>Add address</PrimaryButton>
    {book.addresses.length >= 20 ? <InlineNotice>You have 20 saved addresses. Remove one to add another.</InlineNotice> : null}
    {book.loading ? <LoadingState label="Loading your saved addresses…" /> : null}
    {!book.loading && !book.error && book.addresses.length === 0 ? <Card><Text style={styles.detail}>No saved addresses yet. Add Home or Work to make your next booking quicker.</Text></Card> : null}
    {book.addresses.map(address => <Card key={address.id}>
      <Text style={styles.title} accessibilityRole="header">{address.label}</Text>
      <Text style={styles.detail}>{address.addressLine}</Text>
      {deleting === address.id ? <>
        <InlineNotice>Remove this saved address from your account?</InlineNotice>
        <PrimaryButton icon="trash-2" loading={book.busy} onPress={() => void remove(address.id)}>Delete address</PrimaryButton>
        <PrimaryButton variant="ghost" disabled={book.busy} onPress={() => setDeleting(null)}>Keep address</PrimaryButton>
      </> : <View style={styles.actions}>
        <PrimaryButton icon="edit-2" variant="secondary" disabled={book.busy} accessibilityLabel={`Edit ${address.label}`} onPress={() => { setMessage(''); setEditor({ id: address.id, initial: address }); }}>Edit</PrimaryButton>
        <PrimaryButton icon="trash-2" variant="ghost" disabled={book.busy} accessibilityLabel={`Remove ${address.label}`} onPress={() => { setMessage(''); setDeleting(address.id); }}>Remove</PrimaryButton>
      </View>}
    </Card>)}
    <PrimaryButton icon="refresh-cw" variant="ghost" loading={book.loading} disabled={book.busy} onPress={() => void book.refresh()}>Refresh addresses</PrimaryButton>
  </View>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.page, backgroundColor: colors.bg, flexGrow: 1, gap: spacing.gap },
  content: { gap: spacing.gap },
  title: { color: colors.text, fontFamily: typography.heading, fontSize: 18 },
  detail: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
