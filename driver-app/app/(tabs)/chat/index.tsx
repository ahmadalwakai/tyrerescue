import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, spacing, fontSize, radius } from '@/constants/theme';
import { chatApi, ChatConversation } from '@/api/client';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { lightHaptic } from '@/services/haptics';

export default function ChatListScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await chatApi.getConversations();
      setConversations(res.conversations);
    } catch {
      // Silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useRefreshOnFocus(fetchConversations);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  }, [fetchConversations]);

  if (loading) return <LoadingScreen />;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={conversations}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
      renderItem={({ item, index }) => (
        <Animated.View entering={FadeInDown.duration(250).delay(index * 40)}>
          <AnimatedPressable
            style={styles.row}
            onPress={() => { lightHaptic(); router.push(`/(tabs)/chat/${item.id}`); }}
            pressScale={0.98}
          >
          <View style={styles.rowLeft}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text style={styles.ref}>#{item.bookingRef}</Text>
              {item.channel === 'admin_driver' && (
                <View style={styles.channelBadge}>
                  <Text style={styles.channelBadgeText}>Admin</Text>
                </View>
              )}
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {item.channel === 'admin_driver' ? 'Tyre Rescue Admin' : (item.customerName ?? 'Customer')}
            </Text>
            {item.lastMessageBody && (
              <Text style={styles.preview} numberOfLines={1}>
                {item.lastMessageBody}
              </Text>
            )}
          </View>
          <View style={styles.rowRight}>
            {item.lastMessageAt && (
              <Text style={styles.time}>
                {format(new Date(item.lastMessageAt), 'HH:mm')}
              </Text>
            )}
            {item.unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
          </AnimatedPressable>
        </Animated.View>
      )}
      ListEmptyComponent={
        <EmptyState
          icon="chatbubbles-outline"
          title="No conversations"
          message="Chat with customers about their bookings."
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  list: {
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  ref: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    color: colors.accent,
    marginBottom: 2,
  },
  name: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.base,
    color: colors.text,
  },
  preview: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  time: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
  },
  badge: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: '#FFFFFF',
  },
  channelBadge: {
    backgroundColor: colors.info,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  channelBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: '#FFFFFF',
  },
});
