import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { colors } from '@/components/theme';

interface TrialBalanceLine {
  code: string;
  name: string;
  accountType: string;
  normalBalance: string;
  debitTotalPence: number;
  creditTotalPence: number;
  netBalancePence: number;
}

interface TrialBalance {
  asOf: string;
  isBalanced: boolean;
  totalDebitPence: number;
  totalCreditPence: number;
  lines: TrialBalanceLine[];
}

export default function LedgerScreen() {
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tb = await api.get<TrialBalance>(
        `/api/admin/tax/companies/${companyId}/ledger/trial-balance`,
      );
      setTrialBalance(tb);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load trial balance');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const provision = useCallback(async () => {
    setProvisioning(true);
    try {
      await api.post(`/api/admin/tax/companies/${companyId}/ledger/trial-balance`, {});
      await load();
    } catch {
      // non-fatal
    } finally {
      setProvisioning(false);
    }
  }, [companyId, load]);

  useEffect(() => {
    void load();
  }, [load]);

  const renderLine = useCallback(({ item }: { item: TrialBalanceLine }) => {
    if (item.debitTotalPence === 0 && item.creditTotalPence === 0) return null;
    return (
      <View style={styles.line}>
        <View style={styles.lineLeft}>
          <Text style={styles.code}>{item.code}</Text>
          <Text style={styles.name}>{item.name}</Text>
        </View>
        <View style={styles.lineRight}>
          <Text style={styles.amount}>
            {item.debitTotalPence > 0 ? `Dr £${(item.debitTotalPence / 100).toFixed(2)}` : ''}
          </Text>
          <Text style={styles.amount}>
            {item.creditTotalPence > 0 ? `Cr £${(item.creditTotalPence / 100).toFixed(2)}` : ''}
          </Text>
        </View>
      </View>
    );
  }, []);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={trialBalance?.lines ?? []}
      keyExtractor={(item) => item.code}
      renderItem={renderLine}
      onRefresh={load}
      refreshing={loading}
      ListHeaderComponent={
        <>
          <Text style={styles.heading}>Trial Balance</Text>
          {trialBalance && (
            <View style={styles.summary}>
              <Text style={styles.summaryText}>As of {trialBalance.asOf}</Text>
              <Text style={[styles.summaryText, trialBalance.isBalanced ? styles.balanced : styles.unbalanced]}>
                {trialBalance.isBalanced ? 'BALANCED' : 'UNBALANCED'}
              </Text>
              <Text style={styles.summaryText}>
                Total Debits: £{(trialBalance.totalDebitPence / 100).toFixed(2)} · Credits: £{(trialBalance.totalCreditPence / 100).toFixed(2)}
              </Text>
            </View>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
          {!trialBalance?.lines.length && (
            <Pressable
              style={[styles.button, provisioning && styles.buttonDisabled]}
              onPress={provision}
              disabled={provisioning}
            >
              {provisioning
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.buttonText}>Provision Chart of Accounts</Text>}
            </Pressable>
          )}
        </>
      }
      ListEmptyComponent={
        loading ? null : <Text style={styles.hint}>No accounts found. Provision the chart of accounts first.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 4 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 },
  summary: { backgroundColor: colors.surface, borderRadius: 8, padding: 10, marginBottom: 8, gap: 4 },
  summaryText: { fontSize: 12, color: colors.text },
  balanced: { color: '#34c759', fontWeight: '700' },
  unbalanced: { color: '#ff3b30', fontWeight: '700' },
  error: { color: '#ff3b30', fontSize: 13 },
  hint: { color: colors.muted, fontStyle: 'italic', textAlign: 'center', marginTop: 24 },
  line: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', justifyContent: 'space-between' },
  lineLeft: { flex: 1 },
  lineRight: { alignItems: 'flex-end' },
  code: { fontSize: 10, color: colors.muted, fontWeight: '700' },
  name: { fontSize: 13, color: colors.text },
  amount: { fontSize: 12, color: colors.text },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
