import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { type ComponentProps, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { colors, typography } from '@/src/theme';

type FeatherName = ComponentProps<typeof Feather>['name'];

function AnimatedTabIcon({ color, focused, name }: { color: string; focused: boolean; name: FeatherName }) {
  const active = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    active.value = withTiming(focused ? 1 : 0, { duration: 220 });
  }, [active, focused]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: active.value * 0.95,
    transform: [{ scale: 0.72 + active.value * 0.28 }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + active.value * 0.1 }],
  }));

  return (
    <View style={styles.tabIconShell}>
      <Animated.View pointerEvents="none" style={[styles.tabIconGlow, glowStyle]} />
      <Animated.View style={iconStyle}>
        <Feather size={22} name={name} color={color} />
      </Animated.View>
    </View>
  );
}

function AnimatedTabLabel({ color, focused, label }: { color: string; focused: boolean; label: string }) {
  const active = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    active.value = withTiming(focused ? 1 : 0, { duration: 220 });
  }, [active, focused]);

  const labelStyle = useAnimatedStyle(() => ({
    opacity: 0.72 + active.value * 0.28,
    transform: [{ translateY: 1 - active.value }],
  }));

  return <Animated.Text style={[styles.tabLabel, { color }, labelStyle]}>{label}</Animated.Text>;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          minHeight: 64 + bottomInset,
          paddingBottom: bottomInset,
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
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="tool" color={color} focused={focused} />,
          tabBarLabel: ({ color, focused }) => <AnimatedTabLabel label="Book" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          title: 'Track',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="map-pin" color={color} focused={focused} />,
          tabBarLabel: ({ color, focused }) => <AnimatedTabLabel label="Track" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="user" color={color} focused={focused} />,
          tabBarLabel: ({ color, focused }) => <AnimatedTabLabel label="Account" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: 'Help',
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon name="phone" color={color} focused={focused} />,
          tabBarLabel: ({ color, focused }) => <AnimatedTabLabel label="Help" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconGlow: {
    backgroundColor: 'rgba(249,115,22,0.16)',
    borderRadius: 16,
    height: 32,
    position: 'absolute',
    width: 32,
  },
  tabIconShell: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    marginTop: 2,
    width: 40,
  },
  tabLabel: {
    fontFamily: typography.bodyMedium,
    fontSize: 11,
  },
});
