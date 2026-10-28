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
import { useVatReturn } from '@/hooks/useVatReturn';
import { colors } from '@/components/theme';
import type { VatPeriodDto } from '@/types/tax-payroll';

export default function VatScreen() {
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
  const { periods, loading, calculating, error, activeReturn, loadPeriods, calculateReturn } =
    useVatReturn(companyId);

  useEffect(() => {
    void loadPeriods();
  }, [loadPeriods]);

  const onCalculate = useCallback(
    async (periodId: string) => {
      await calculateReturn(periodId);
    },
    [calculateReturn],
  );

  const renderPeriod = useCallback(
    ({ item }: { item: VatPeriodDto }) => (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.periodKey}>{item.periodKey}</Text>
          <Text style={[styles.badge, item.status === 'open' ? styles.badgeOpen : styles.badgeOther]}>
            {item.status}
          </Text>
        </View>
        <Text style={styles.meta}>
          {item.periodStart} – {item.periodEnd} · Due {item.dueDate}
        </Text>
        {item.status === 'open' && (
          <Pressable
            style={[styles.button, calculating && styles.buttonDisabled]}
            onPress={() => onCalculate(item.id)}
            disabled={calculating}
          >
            {calculating
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.buttonText}>Calculate Return</Text>}
          </Pressable>
        )}
      </View>
    ),
    [calculating, onCalculate],
  );

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={periods}
      keyExtractor={(item) => item.id}
      renderItem={renderPeriod}
      ListHeaderComponent={
        <>
          <Text style={styles.heading}>VAT Periods</Text>
          {error && <Text style={styles.error}>{error}</Text>}
          {activeReturn && (
            <View style={styles.returnCard}>
              <Text style={styles.returnTitle}>Latest Calculation</Text>
              <Text style={styles.returnRow}>Box 1 (Output Tax): £{(activeReturn.box1OutputTaxPence / 100).toFixed(2)}</Text>
              <Text style={styles.returnRow}>Box 4 (Input Tax): £{(activeReturn.box4InputTaxClaimedPence / 100).toFixed(2)}</Text>
              <Text style={[styles.returnRow, styles.returnTotal]}>
                Box 5 (Net VAT): £{(activeReturn.box5NetVatPayablePence / 100).toFixed(2)}
              </Text>
              <Text style={styles.disclaimer}>Draft only — not submitted to HMRC</Text>
            </View>
          )}
        </>
      }
      ListEmptyComponent={
        <Text style={styles.hint}>No VAT periods recorded. VAT periods are added via the admin portal.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 },
  error: { color: '#ff3b30', fontSize: 13 },
  hint: { color: colors.muted, fontStyle: 'italic', textAlign: 'center', marginTop: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 8, padding: 12, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  periodKey: { fontSize: 16, fontWeight: '700', color: colors.text },
  badge: { fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeOpen: { backgroundColor: '#ff9500', color: '#fff' },
  badgeOther: { backgroundColor: colors.muted, color: '#fff' },
  meta: { fontSize: 11, color: colors.muted },
  button: { backgroundColor: colors.accent, borderRadius: 6, padding: 10, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  returnCard: { backgroundColor: colors.surface, borderRadius: 8, padding: 14, gap: 6, marginBottom: 8 },
  returnTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  returnRow: { fontSize: 13, color: colors.text },
  returnTotal: { fontWeight: '700', fontSize: 15, marginTop: 4 },
  disclaimer: { fontSize: 10, color: colors.muted, fontStyle: 'italic' },
});
