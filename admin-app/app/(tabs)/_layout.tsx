import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/context';
import { colors, spacing, typography } from '@/ui/theme';

export default function TabsLayout() {
  const { logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);

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
          paddingBottom: bottomPad,
          paddingTop: spacing.xs,
          height: 56 + bottomPad,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: typography.weight.semibold,
          marginTop: -2,
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
          tabBarLabel: 'Home',
          headerShown: true,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          tabBarLabel: 'Bookings',
          headerShown: true,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="drivers"
        options={{
          title: 'Drivers',
          tabBarLabel: 'Drivers',
          headerShown: true,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="car-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarLabel: 'Stock',
          headerShown: true,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarLabel: 'More',
          headerShown: true,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal" size={size} color={color} />
          ),
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
