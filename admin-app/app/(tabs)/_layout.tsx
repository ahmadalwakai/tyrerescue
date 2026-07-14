import { Tabs } from 'expo-router';
import { BottomNav } from '@/ui';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <BottomNav {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
        }}
      />
      <Tabs.Screen
        name="ops"
        options={{
          title: 'Jobs',
        }}
      />
      <Tabs.Screen
        name="drivers"
        options={{
          title: 'Drivers',
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
        }}
      />

      <Tabs.Screen name="inventory" options={{ tabBarButton: () => null, title: 'Inventory' }} />
      <Tabs.Screen
        name="finance"
        options={{ tabBarButton: () => null, title: 'Finance' }}
      />
      <Tabs.Screen
        name="cms"
        options={{ tabBarButton: () => null, title: 'Content' }}
      />
      <Tabs.Screen
        name="insights"
        options={{ tabBarButton: () => null, title: 'Analytics' }}
      />
    </Tabs>
  );
}
