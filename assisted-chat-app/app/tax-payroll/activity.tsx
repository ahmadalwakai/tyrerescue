import { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTaxActivity } from '@/hooks/useTaxActivity';
import { colors } from '@/components/theme';
import type { TaxAuditEventDto } from '@/types/tax-payroll';

export default function TaxActivityScreen() {
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
  const { events, hasMore, loading, loadingMore, error, load, loadMore } = useTaxActivity(
    companyId ?? '',
  );

  useEffect(() => {
    if (companyId) void load();
  }, [companyId, load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={load}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={events}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <AuditEventRow event={item} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No activity recorded yet.</Text>
        </View>
      }
      ListFooterComponent={
        hasMore ? (
          <Pressable
            style={[styles.loadMoreButton, loadingMore && styles.buttonDisabled]}
            onPress={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={styles.loadMoreText}>Load More</Text>
            )}
          </Pressable>
        ) : null
      }
    />
  );
}

function AuditEventRow({ event }: { event: TaxAuditEventDto }) {
  const date = new Date(event.createdAt);
  const formatted = date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={styles.row}>
      <View style={styles.rowDot} />
      <View style={styles.rowBody}>
        <Text style={styles.rowSummary}>{event.summary}</Text>
        {event.changedFields && event.changedFields.length > 0 ? (
          <Text style={styles.rowFields}>
            Changed: {event.changedFields.join(', ')}
          </Text>
        ) : null}
        <Text style={styles.rowDate}>{formatted}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  errorText: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  retryText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  empty: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { color: colors.muted, fontSize: 14 },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: 30 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, gap: 12 },
  rowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginTop: 5,
  },
  rowBody: { flex: 1, gap: 3 },
  rowSummary: { color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  rowFields: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  rowDate: { color: colors.subtle, fontSize: 12 },
  loadMoreButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
  },
  loadMoreText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  buttonDisabled: { opacity: 0.55 },
});
