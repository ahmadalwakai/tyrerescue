import { Stack } from 'expo-router';

export default function OpsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Operations' }} />
      <Stack.Screen name="callbacks" options={{ title: 'Callbacks' }} />
      <Stack.Screen name="messages" options={{ title: 'Messages' }} />
      <Stack.Screen name="chat" options={{ title: 'Chat' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
    </Stack>
  );
}
