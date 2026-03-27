import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useAuth } from '@/auth/context';
import { colors, spacing, typography } from '@/ui/theme';

export default function TabsLayout() {
  const { logout } = useAuth();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.bg,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          color: colors.text,
          fontSize: typography.size.lg,
          fontWeight: typography.weight.semibold,
        },
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingBottom: spacing.sm,
          paddingTop: spacing.sm,
          height: 64,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: typography.size.xs,
          fontWeight: typography.weight.semibold,
        },
        headerRight: () => (
          <Pressable
            onPress={async () => {
              await logout();
              router.replace('/(auth)/login');
            }}
            style={styles.logoutButton}
          >
            <Text style={[styles.logoutText, { color: colors.primary }]}>Sign out</Text>
          </Pressable>
        ),
      }}
    >
      {/* ── Visible primary tabs ── */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          headerShown: true,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          tabBarLabel: 'Bookings',
          headerShown: true,
        }}
      />
      <Tabs.Screen
        name="drivers"
        options={{
          title: 'Drivers',
          tabBarLabel: 'Drivers',
          headerShown: true,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarLabel: 'Inventory',
          headerShown: true,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarLabel: 'More',
          headerShown: true,
        }}
      />

      {/* ── Overflow modules — navigable via More, hidden from tab bar ── */}
      <Tabs.Screen
        name="ops"
        options={{ tabBarButton: () => null, headerShown: true, title: 'Operations' }}
      />
      <Tabs.Screen
        name="finance"
        options={{ tabBarButton: () => null, headerShown: true, title: 'Finance' }}
      />
      <Tabs.Screen
        name="cms"
        options={{ tabBarButton: () => null, headerShown: true, title: 'Content' }}
      />
      <Tabs.Screen
        name="insights"
        options={{ tabBarButton: () => null, headerShown: true, title: 'Analytics' }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  logoutButton: {
    marginRight: spacing.lg,
  },
  logoutText: {
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.sm,
  },
});
