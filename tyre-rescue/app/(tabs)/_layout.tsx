import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { colors, typography } from '@/src/theme';
import { Feather } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          minHeight: 64,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: typography.bodyMedium,
          fontSize: 11,
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Book',
          tabBarIcon: ({ color }) => <Feather size={22} name="tool" color={color} />,
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          title: 'Track',
          tabBarIcon: ({ color }) => <Feather size={22} name="map-pin" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color }) => <Feather size={22} name="user" color={color} />,
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: 'Help',
          tabBarIcon: ({ color }) => <Feather size={22} name="phone" color={color} />,
        }}
      />
    </Tabs>
  );
}
