import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSize } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { useChatUnreadCount } from '@/hooks/useChatUnreadCount';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);
  const { t } = useI18n();
  const { unreadCount } = useChatUnreadCount(5_000);

  const tabBarStyle = {
    backgroundColor: colors.surface,
    borderTopColor: 'rgba(255,255,255,0.06)',
    borderTopWidth: 1,
    paddingBottom: bottomPad,
    height: 56 + bottomPad,
    ...Platform.select({
      web: {
        boxShadow: '0 -2px 8px rgba(0,0,0,0.3)',
      },
      default: {
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
    }),
  } as const;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: 'Inter_700Bold', fontSize: fontSize.lg },
        tabBarStyle,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginTop: -2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.dashboard'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="speedometer-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={({ route }) => {
          // The full-screen in-app navigation cockpit lives at
          // jobs/[ref]/route. Hide the bottom tab bar there ONLY, so the map is
          // truly full-screen; every other jobs sub-screen keeps the tabs.
          const focused = getFocusedRouteNameFromRoute(route);
          const onRoute = focused === '[ref]/route';
          return {
            title: t('tabs.jobs'),
            headerShown: false,
            tabBarStyle: onRoute ? { display: 'none' as const } : tabBarStyle,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="briefcase-outline" size={size} color={color} />
            ),
          };
        }}
      />
      <Tabs.Screen
        name="chat"
        options={({ route }) => {
          const focused = getFocusedRouteNameFromRoute(route);
          const inConversation = focused === '[id]';
          return {
            title: t('tabs.chat'),
            headerShown: false,
            tabBarStyle: inConversation ? { display: 'none' as const } : tabBarStyle,
            tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
            tabBarBadgeStyle: {
              backgroundColor: colors.danger,
              color: colors.white,
              fontFamily: 'Inter_700Bold',
              fontSize: 10,
            },
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles-outline" size={size} color={color} />
            ),
          };
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('tabs.alerts'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
