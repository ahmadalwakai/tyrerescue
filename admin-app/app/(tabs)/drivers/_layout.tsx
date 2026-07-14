import { Stack } from 'expo-router';

export default function DriversLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" options={{ title: 'Drivers' }} />
      <Stack.Screen name="tracking" options={{ title: 'Live Tracking' }} />
      <Stack.Screen name="[id]" options={{ title: 'Driver Detail' }} />
    </Stack>
  );
}
