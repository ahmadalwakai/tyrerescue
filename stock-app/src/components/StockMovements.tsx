import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/theme';
import type { StockMovement } from '@/types';
import { Button, EmptyState, Message } from './StockPrimitives';

const movementLabels: Record<string, string> = {
  SALE: 'Sale', RECEIVED: 'Stock received', RETURN: 'Returned to stock', DAMAGED: 'Damaged stock', CORRECTION: 'Stock correction', SALE_REVERSAL: 'Sale reversed',
};

function dateLabel(value: string | null) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function StockMovements({ items, loading, error, onRetry }: {
  items: StockMovement[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headingText}><Text style={styles.title}>Recent activity</Text><Text style={styles.caption}>Latest 10 stock movements for this city.</Text></View>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>
      {error ? <View style={styles.error}><Message text={error} tone="error" /><Button title="Retry activity" onPress={onRetry} icon="refresh" /></View> : null}
      {items.length === 0 ? (
        loading ? <Text style={styles.loading}>Loading activity…</Text> : !error ? <EmptyState title="No recent movements" description="Recorded stock changes will appear here." /> : null
      ) : items.map((item) => {
        const negative = item.quantityDelta < 0;
        const color = negative ? colors.danger : colors.success;
        return (
          <View key={item.id} style={styles.row}>
            <View style={[styles.icon, { backgroundColor: negative ? colors.dangerSoft : colors.successSoft }]}>
              <MaterialCommunityIcons name={negative ? 'arrow-top-right' : 'arrow-bottom-left'} size={19} color={color} />
            </View>
            <View style={styles.main}>
              <View style={styles.rowHeading}><Text style={styles.movement}>{movementLabels[item.movementType] ?? 'Stock movement'}</Text><Text style={[styles.delta, { color }]}>{item.quantityDelta > 0 ? '+' : ''}{item.quantityDelta}</Text></View>
              <Text style={styles.product}>{item.product.sizeDisplay} · {item.product.brand} {item.product.pattern}</Text>
              <Text style={styles.meta}>{item.actorName ?? 'Unknown worker'} · {dateLabel(item.occurredAt)}</Text>
              <View style={styles.details}>
                <Text style={styles.balance}>Balance {item.previousBalance} → {item.resultingBalance}</Text>
                {item.saleChannel ? <Text style={styles.channel}>{item.saleChannel === 'GARAGE' ? 'Garage' : 'Emergency'}</Text> : null}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingText: { flex: 1, gap: 6 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  caption: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  error: { gap: 8 },
  loading: { color: colors.muted, fontSize: 14, paddingVertical: 20 },
  row: { backgroundColor: colors.panel, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 7, minWidth: 0 },
  rowHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  movement: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  delta: { fontSize: 17, fontWeight: '800' },
  product: { color: colors.text, fontSize: 13, lineHeight: 19 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  details: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  balance: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  channel: { color: colors.primary, fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.primarySoft, borderRadius: radius.sm },
});
