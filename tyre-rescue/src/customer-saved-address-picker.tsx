import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCustomerAccount } from './customer-account';
import { useCustomerAddresses, type CustomerSavedAddress } from './customer-addresses';
import { colors, typography } from './theme';
import { Disclosure, InlineNotice, PrimaryButton } from './ui';

export function CustomerSavedAddressPicker({ onSelect }: { onSelect: (address: CustomerSavedAddress) => void }) {
  const account = useCustomerAccount();
  if (account.loading || !account.token || !account.profile) return null;
  return <SavedAddressChoices key={JSON.stringify([account.profile.id, account.token, account.sessionRevision])} onSelect={onSelect} />;
}

function SavedAddressChoices({ onSelect }: { onSelect: (address: CustomerSavedAddress) => void }) {
  const book = useCustomerAddresses();
  const { refresh } = book;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return <Disclosure title="Saved addresses" summary={book.loading ? 'Loading…' : `${book.addresses.length} saved`}>
    {book.error ? <InlineNotice tone="danger">{book.error}</InlineNotice> : null}
    {!book.loading && !book.error && !book.addresses.length ? <Text style={styles.detail}>Save Home or Work in your account to use it here.</Text> : null}
    {book.addresses.map(address => <View key={address.id} style={styles.choice}>
      <Text style={styles.detail}>{address.addressLine}</Text>
      <PrimaryButton icon="map-pin" variant="secondary" onPress={() => onSelect(address)}>Use {address.label}</PrimaryButton>
    </View>)}
    <PrimaryButton variant="ghost" icon="refresh-cw" loading={book.loading} onPress={() => void refresh()}>Refresh saved addresses</PrimaryButton>
    <PrimaryButton variant="ghost" icon="edit-2" onPress={() => router.push('/addresses')}>Manage saved addresses</PrimaryButton>
  </Disclosure>;
}

const styles = StyleSheet.create({
  detail: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  choice: { gap: 6 },
});
