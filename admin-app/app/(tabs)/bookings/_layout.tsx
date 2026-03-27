import { Stack } from 'expo-router';

export default function BookingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Bookings' }} />
      <Stack.Screen name="[ref]" options={{ title: 'Booking Detail' }} />
    </Stack>
  );
}
