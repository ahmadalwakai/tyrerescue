import { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTaxNotifications } from '@/hooks/useTaxNotifications';
import { colors } from '@/components/theme';
import type { TaxNotificationDto } from '@/types/tax-payroll';

const SEVERITY_COLOR: Record<string, string> = {
  action_required: '#ff3b30',
  warning: '#ff9500',
  info: colors.accent,
};

export default function NotificationsScreen() {
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
  const { notifications, loading, unreadCount, load, markRead } = useTaxNotifications(companyId);

  useEffect(() => {
    void load();
  }, [load]);

  const renderItem = useCallback(
    ({ item }: { item: TaxNotificationDto }) => (
      <Pressable
        style={[styles.card, !item.readAt && styles.cardUnread]}
        onPress={() => !item.readAt && markRead(item.id)}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.dot, { backgroundColor: SEVERITY_COLOR[item.severity] ?? colors.accent }]} />
          <Text style={styles.title}>{item.title}</Text>
        </View>
        <Text style={styles.body}>{item.body}</Text>
        <Text style={styles.time}>{new Date(item.createdAt).toLocaleString('en-GB')}</Text>
        {!item.readAt && <Text style={styles.unreadBadge}>TAP TO DISMISS</Text>}
      </Pressable>
    ),
    [markRead],
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={notifications}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      onRefresh={load}
      refreshing={loading}
      ListHeaderComponent={
        <Text style={styles.heading}>
          Notifications {unreadCount > 0 ? `(${unreadCount} unread)` : ''}
        </Text>
      }
      ListEmptyComponent={
        loading
          ? <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          : <Text style={styles.hint}>No notifications</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 10 },
  heading: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 },
  hint: { color: colors.muted, fontStyle: 'italic', textAlign: 'center', marginTop: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 8, padding: 12, gap: 4 },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: colors.accent },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
  body: { fontSize: 13, color: colors.text, lineHeight: 18 },
  time: { fontSize: 10, color: colors.muted, marginTop: 2 },
  unreadBadge: { fontSize: 9, color: colors.accent, fontWeight: '700', letterSpacing: 0.5 },
});
