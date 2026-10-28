import { useEffect } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useCorporationTax } from '@/hooks/useCorporationTax';
import { colors } from '@/components/theme';

export default function CorporationTaxScreen() {
  const { companyId, periodId } = useLocalSearchParams<{ companyId: string; periodId: string }>();
  const { period, loading, error, loadPeriod } = useCorporationTax(companyId);

  useEffect(() => {
    if (periodId) void loadPeriod(periodId);
  }, [loadPeriod, periodId]);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={colors.accent} /></View>;
  }

  if (!periodId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.hint}>Select a Corporation Tax period from the overview screen.</Text>
      </View>
    );
  }

  if (!period) {
    return (
      <View style={styles.centered}>
        {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.hint}>Period not found.</Text>}
      </View>
    );
  }

  const netCtPounds = (period.netCtPayablePence / 100).toFixed(2);
  const effectivePercent = period.effectiveRateBps != null
    ? (period.effectiveRateBps / 100).toFixed(2)
    : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Corporation Tax</Text>
      <Text style={styles.period}>{period.periodStart} – {period.periodEnd}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Taxable Total Profits</Text>
        <Text style={styles.value}>£{(period.taxableTotalProfitsPence / 100).toFixed(2)}</Text>
        <Text style={styles.label}>Rate Applied</Text>
        <Text style={styles.value}>{period.rateApplied?.replace('_', ' ') ?? 'Not calculated'}</Text>
        {period.marginalReliefPence > 0 && (
          <>
            <Text style={styles.label}>Marginal Relief</Text>
            <Text style={styles.value}>£{(period.marginalReliefPence / 100).toFixed(2)}</Text>
          </>
        )}
        <Text style={styles.label}>CT Payable</Text>
        <Text style={styles.ctPayable}>£{netCtPounds}</Text>
        {effectivePercent && (
          <>
            <Text style={styles.label}>Effective Rate</Text>
            <Text style={styles.value}>{effectivePercent}%</Text>
          </>
        )}
      </View>

      <Text style={styles.disclaimer}>
        Draft calculation only. Figures are subject to finalisation and are not submitted to HMRC.
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  heading: { fontSize: 18, fontWeight: '700', color: colors.text },
  period: { fontSize: 13, color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: 8, padding: 14, gap: 4 },
  label: { fontSize: 11, color: colors.muted, textTransform: 'uppercase', marginTop: 8 },
  value: { fontSize: 14, color: colors.text },
  ctPayable: { fontSize: 22, fontWeight: '900', color: colors.text, marginTop: 2 },
  disclaimer: { fontSize: 11, color: colors.muted, fontStyle: 'italic', textAlign: 'center' },
  error: { color: '#ff3b30', fontSize: 13 },
  hint: { color: colors.muted, fontStyle: 'italic', textAlign: 'center' },
});
