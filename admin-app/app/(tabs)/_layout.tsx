import { Tabs, useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useAuth } from '@/auth/context';
import { colors } from '@/ui/theme';

export default function TabsLayout() {
  const { logout } = useAuth();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#FFFFFF' },
        headerTintColor: colors.text,
        tabBarActiveTintColor: colors.primary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        headerRight: () => (
          <Pressable
            onPress={async () => {
              await logout();
              router.replace('/(auth)/login');
            }}
            style={{ marginRight: 14 }}
          >
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Sign out</Text>
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarLabel: 'Dashboard' }} />
      <Tabs.Screen name="bookings" options={{ headerShown: false, title: 'Bookings', tabBarLabel: 'Bookings' }} />
      <Tabs.Screen name="drivers" options={{ headerShown: false, title: 'Drivers', tabBarLabel: 'Drivers' }} />
      <Tabs.Screen name="inventory" options={{ headerShown: false, title: 'Inventory', tabBarLabel: 'Inventory' }} />
      <Tabs.Screen
        name="ops"
        options={{
          headerShown: false,
          title: 'Ops',
          tabBarLabel: 'Ops',
        }}
      />
      <Tabs.Screen name="finance" options={{ headerShown: false, title: 'Finance', tabBarLabel: 'Finance' }} />
      <Tabs.Screen name="cms" options={{ headerShown: false, title: 'CMS', tabBarLabel: 'CMS' }} />
      <Tabs.Screen name="insights" options={{ headerShown: false, title: 'Insights', tabBarLabel: 'Insights' }} />
    </Tabs>
  );
}
