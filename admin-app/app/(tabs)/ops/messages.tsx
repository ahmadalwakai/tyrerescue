import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import {
  AdminShell,
  GlassCard,
  PressScale,
  SearchBar,
  StatePanel,
  StatusBadge,
  colors,
  formatShortDate,
  spacing,
  typography,
} from '@/ui';
import { useMemo, useState } from 'react';

type MessageItem = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: string;
  createdAt: string | null;
};

type MessagesResponse = {
  items: MessageItem[];
  unreadCount: number;
};

export default function MessagesScreen() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const { data, isLoading, error, refetch } = useQuery<MessagesResponse>({
    queryKey: ['messages'],
    queryFn: () => apiClient.get('/api/mobile/admin/messages?status=all'),
  });

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiClient.patch(`/api/mobile/admin/messages/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages'] }),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const items = data?.items ?? [];
    if (!term) return items;
    return items.filter((item) =>
      [item.name, item.email, item.phone, item.message, item.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [data?.items, search]);

  const errorMessage = error instanceof Error ? error.message : null;

  return (
    <AdminShell
      title="Messages"
      subtitle="Team communication"
      notificationCount={data?.unreadCount}
    >
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search conversations..." />

      <StatePanel
        loading={isLoading}
        error={errorMessage}
        empty={!isLoading && !errorMessage && filtered.length === 0}
        emptyLabel="No messages found."
        onRetry={() => refetch()}
      />

      {filtered.map((item, index) => (
        <GlassCard key={item.id} animatedIndex={index} accent={item.status === 'unread' ? 'orange' : 'blue'}>
          <View style={styles.messageRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={21} color={colors.text} />
              {item.status === 'unread' ? <View style={styles.unreadDot} /> : null}
            </View>
            <View style={styles.messageBody}>
              <View style={styles.messageTop}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name || 'Unknown sender'}
                </Text>
                <Text style={styles.time}>{formatShortDate(item.createdAt)}</Text>
              </View>
              <Text style={styles.meta} numberOfLines={1}>
                {item.email || item.phone || 'No contact'}
              </Text>
              <Text style={styles.preview} numberOfLines={2}>
                {item.message || 'No message body'}
              </Text>
              <View style={styles.actionRow}>
                <StatusBadge status={item.status} />
                <PressScale
                  style={styles.smallAction}
                  onPress={() => mutation.mutate({ id: item.id, status: 'read' })}
                  disabled={item.status === 'read' || mutation.isPending}
                >
                  <Text style={styles.smallActionText}>Read</Text>
                </PressScale>
                <PressScale
                  style={styles.smallAction}
                  onPress={() => mutation.mutate({ id: item.id, status: 'replied' })}
                  disabled={item.status === 'replied' || mutation.isPending}
                >
                  <Text style={styles.smallActionText}>Replied</Text>
                </PressScale>
              </View>
            </View>
          </View>
        </GlassCard>
      ))}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
  },
  unreadDot: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  messageBody: {
    flex: 1,
    minWidth: 0,
  },
  messageTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: typography.weight.bold,
  },
  time: {
    color: colors.textMuted,
    fontSize: 10,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  preview: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  smallAction: {
    minHeight: 32,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallActionText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: typography.weight.bold,
  },
});
