import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, spacing, fontSize, radius } from '@/constants/theme';
import { notificationApi, DriverNotification } from '@/api/client';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { EmptyState } from '@/components/EmptyState';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { lightHaptic } from '@/services/haptics';
import { useI18n } from '@/i18n';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  new_job: 'briefcase',
  status_update: 'swap-horizontal',
  chat_message: 'chatbubble',
  system: 'information-circle',
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { t, dateLocale } = useI18n();
  const [items, setItems] = useState<DriverNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const data = await notificationApi.getNotifications();
      setItems(data.notifications);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useRefreshOnFocus(fetch);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetch();
    setRefreshing(false);
  }, [fetch]);

  const markAllRead = async () => {
    try {
      await notificationApi.markRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // silent
    }
  };

  const handlePress = async (n: DriverNotification) => {
    lightHaptic();
    // Mark individual as read
    if (!n.isRead) {
      notificationApi.markRead(n.id).catch(() => {});
      setItems((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item)),
      );
    }
    // Navigate if applicable
    if (n.bookingRef) {
      if (n.type === 'chat_message') {
        // Deep-link into chat (bookingRef used to find conversation)
        router.push('/(tabs)/chat');
      } else {
        router.push(`/(tabs)/jobs/${n.bookingRef}`);
      }
    }
  };

  const unreadCount = items.filter((n) => !n.isRead).length;

  const renderItem = ({ item, index }: { item: DriverNotification; index: number }) => {
    const icon = ICONS[item.type] || 'notifications';
    return (
      <Animated.View entering={FadeInDown.duration(250).delay(index * 40)}>
        <AnimatedPressable
          style={[styles.row, !item.isRead && styles.rowUnread]}
          onPress={() => handlePress(item)}
          pressScale={0.98}
        >
        <View style={[styles.iconCircle, !item.isRead && styles.iconCircleUnread]}>
          <Ionicons name={icon} size={18} color={!item.isRead ? colors.accent : colors.muted} />
        </View>
        <View style={styles.rowContent}>
          <Text style={[styles.title, !item.isRead && styles.titleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.body} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={styles.time}>
            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: dateLocale })}
          </Text>
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
        </AnimatedPressable>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      {unreadCount > 0 && (
        <View style={styles.header}>
          <Text style={styles.headerText}>
            {t('notifications.unread', { count: unreadCount })}
          </Text>
          <AnimatedPressable onPress={() => { lightHaptic(); markAllRead(); }} pressScale={0.95}>
            <Text style={styles.markAllText}>{t('notifications.markAllRead')}</Text>
          </AnimatedPressable>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="notifications-off-outline"
              title={t('notifications.noNotifications')}
              message={t('notifications.allCaughtUp')}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  markAllText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.accent,
  },
  list: {
    paddingVertical: spacing.xs,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  rowUnread: {
    backgroundColor: 'rgba(234,88,12,0.05)',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  iconCircleUnread: {
    backgroundColor: 'rgba(234,88,12,0.15)',
  },
  rowContent: {
    flex: 1,
  },
  title: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  titleUnread: {
    fontFamily: 'Inter_700Bold',
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: 2,
  },
  time: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginTop: 8,
  },
});
