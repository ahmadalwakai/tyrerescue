import { Stack } from 'expo-router';
import { CustomerAddressBook } from '@/src/customer-address-book';

export default function AddressesScreen() {
  return <><Stack.Screen options={{ headerShown: false }} /><CustomerAddressBook /></>;
}
