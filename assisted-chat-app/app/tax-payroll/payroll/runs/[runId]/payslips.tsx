import { useCallback, useEffect } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { usePayrollRun } from '@/hooks/usePayrollRun';
import { colors } from '@/components/theme';
import type { PayslipDocumentDto } from '@/types/tax-payroll';

export default function PayslipsScreen() {
  const { companyId, runId } = useLocalSearchParams<{ companyId: string; runId: string }>();
  const { payslips, loadPayslips } = usePayrollRun(companyId, runId);

  useEffect(() => {
    void loadPayslips();
  }, [loadPayslips]);

  const renderItem = useCallback(({ item }: { item: PayslipDocumentDto }) => (
    <View style={styles.card}>
      <Text style={styles.filename}>{item.filename}</Text>
      <Text style={styles.meta}>
        {(item.sizeBytes / 1024).toFixed(1)} KB · {new Date(item.generatedAt).toLocaleDateString('en-GB')}
      </Text>
      {item.downloadUrl ? (
        <Text style={styles.hint}>Download available via admin portal</Text>
      ) : (
        <Text style={styles.hint}>Download requires sensitive.read permission</Text>
      )}
    </View>
  ), []);

  if (!payslips.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.hint}>No payslips generated yet. Finalise the pay run to generate payslips.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={payslips}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={
        <Text style={styles.heading}>{payslips.length} payslip{payslips.length !== 1 ? 's' : ''} generated</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 8 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  heading: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 8, padding: 12, gap: 4 },
  filename: { fontSize: 13, fontWeight: '600', color: colors.text },
  meta: { fontSize: 11, color: colors.muted },
  hint: { fontSize: 11, color: colors.muted, fontStyle: 'italic' },
});
