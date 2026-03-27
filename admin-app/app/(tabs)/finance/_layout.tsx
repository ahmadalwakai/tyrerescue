import { Stack } from 'expo-router';

export default function FinanceLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Finance' }} />
      <Stack.Screen name="pricing" options={{ title: 'Pricing' }} />
      <Stack.Screen name="availability" options={{ title: 'Availability' }} />
      <Stack.Screen name="invoices/index" options={{ title: 'Invoices' }} />
      <Stack.Screen name="invoices/[id]" options={{ title: 'Invoice Detail' }} />
    </Stack>
  );
}
