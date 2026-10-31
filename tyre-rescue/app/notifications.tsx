import { Stack } from 'expo-router';
import { CustomerNotificationSettings } from '@/src/customer-notification-settings';

export default function NotificationsScreen() {
  return <>
    <Stack.Screen options={{ headerShown: false }} />
    <CustomerNotificationSettings />
  </>;
}
