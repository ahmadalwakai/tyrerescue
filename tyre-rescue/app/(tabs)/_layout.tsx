import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { type ComponentProps } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { colors, typography } from '@/src/theme';

type FeatherName = ComponentProps<typeof Feather>['name'];

function TabIcon({ color, focused, name }: { color: string; focused: boolean; name: FeatherName }) {
  return (
    <View accessible={false} style={[styles.tabIconShell, focused ? styles.tabIconSelected : null]}>
      <Feather accessible={false} size={22} name={name} color={color} />
    </View>
  );
}

function TabLabel({ color, focused, label }: { color: string; focused: boolean; label: string }) {
  return <Text style={[styles.tabLabel, { color, fontFamily: focused ? typography.bodyBold : typography.bodyMedium }]}>{label}</Text>;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const bottomInset = Math.max(insets.bottom, 8);
  // Reserve enough room for wrapped labels at the user's preferred text size.
  const labelLines = Math.max(1, Math.ceil((7 * 7.2 * fontScale) / Math.max(1, width / 4 - 12)));
  const tabBarHeight = 40 + Math.ceil(16 * fontScale) * labelLines + bottomInset;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: tabBarHeight,
          minHeight: 56 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: typography.bodyMedium,
          fontSize: 12,
          lineHeight: 16,
        },
        tabBarItemStyle: { minHeight: 44, paddingHorizontal: 4 },
        tabBarAllowFontScaling: true,
        animation: 'none',
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Book',
          tabBarAccessibilityLabel: 'Book a tyre service',
          tabBarIcon: ({ color, focused }) => <TabIcon name="tool" color={color} focused={focused} />,
          tabBarLabel: ({ color, focused }) => <TabLabel label="Book" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          title: 'Track',
          tabBarAccessibilityLabel: 'Track your booking',
          tabBarIcon: ({ color, focused }) => <TabIcon name="map-pin" color={color} focused={focused} />,
          tabBarLabel: ({ color, focused }) => <TabLabel label="Track" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarAccessibilityLabel: 'Your account and bookings',
          tabBarIcon: ({ color, focused }) => <TabIcon name="user" color={color} focused={focused} />,
          tabBarLabel: ({ color, focused }) => <TabLabel label="Account" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          href: null,
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: 'Help',
          tabBarAccessibilityLabel: 'Get help from Tyre Rescue',
          tabBarIcon: ({ color, focused }) => <TabIcon name="phone" color={color} focused={focused} />,
          tabBarLabel: ({ color, focused }) => <TabLabel label="Help" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconSelected: {
    backgroundColor: colors.surfaceRaised,
  },
  tabIconShell: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    borderRadius: 10,
    width: 44,
  },
  tabLabel: {
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
    textAlign: 'center',
    maxWidth: '100%',
  },
});
