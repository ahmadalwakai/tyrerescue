import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { colors, spacing, fontSize, radius } from '@/constants/theme';
import { chatApi, ChatConversation } from '@/api/client';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';

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
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={() => router.push(`/(tabs)/chat/${item.id}`)}
        >
          <View style={styles.rowLeft}>
            <Text style={styles.ref}>#{item.bookingRef}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {item.customerName ?? 'Customer'}
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
        </Pressable>
      )}
      ListEmptyComponent={
        <EmptyState title="No conversations" message="Chat with customers about their bookings." />
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.surface,
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
});
