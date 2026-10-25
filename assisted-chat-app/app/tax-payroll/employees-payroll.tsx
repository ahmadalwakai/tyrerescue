import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEmployees } from '@/hooks/useEmployees';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { usePayrollDrafts } from '@/hooks/usePayrollDrafts';
import { colors } from '@/components/theme';
import type { EmployeeSummaryDto } from '@/types/tax-payroll';

export default function EmployeesPayrollScreen() {
  const { companyId } = useLocalSearchParams<{ companyId: string }>();
  const router = useRouter();

  const { employees, loading: empLoading, error: empError, load: loadEmployees } = useEmployees(companyId);
  const { settings, setup, isActivated, loading: settingsLoading, error: settingsError, load: loadSettings } = usePayrollSettings(companyId);
  const { runs, loading: runsLoading, error: runsError, load: loadRuns } = usePayrollDrafts(companyId);

  useFocusEffect(useCallback(() => { void loadSettings(); }, [loadSettings]));
  useFocusEffect(useCallback(() => {
    if (isActivated) { void loadRuns(); void loadEmployees(); }
  }, [isActivated, loadRuns, loadEmployees]));

  const onEmployeePress = useCallback(
    (emp: EmployeeSummaryDto) => {
      router.push({
        pathname: '/tax-payroll/employees/[employeeId]' as const,
        params: { employeeId: emp.id, companyId },
      });
    },
    [router, companyId],
  );

  const onNewEmployee = useCallback(() => {
    router.push({ pathname: '/tax-payroll/employees/new', params: { companyId } });
  }, [router, companyId]);

  const onPayrollSettings = useCallback(() => {
    router.push({ pathname: '/tax-payroll/payroll/settings', params: { companyId } });
  }, [router, companyId]);

  const onNewRun = useCallback(() => {
    router.push({ pathname: '/tax-payroll/payroll/runs/new', params: { companyId } });
  }, [router, companyId]);

  const onRunPress = useCallback(
    (runId: string) => {
      router.push({
        pathname: '/tax-payroll/payroll/runs/[runId]' as const,
        params: { runId, companyId },
      });
    },
    [router, companyId],
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={isActivated ? employees ?? [] : []}
      keyExtractor={(emp) => emp.id}
      ListHeaderComponent={
        <>
          {/* Payroll status card */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Payroll</Text>
            {settingsLoading ? <ActivityIndicator color={colors.accent} /> : settingsError ? <>
              <Text style={styles.errorText}>{settingsError}</Text>
              <Pressable style={styles.chipButton} onPress={() => { void loadSettings(); }}><Text style={styles.chipButtonText}>Retry payroll settings</Text></Pressable>
            </> : isActivated && settings ? (
              <>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Schedule</Text>
                  <Text style={styles.rowValue}>{settings.scheduleLabel}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Frequency</Text>
                  <Text style={styles.rowValue}>{settings.payFrequency.replace(/_/g, ' ')}</Text>
                </View>
                <View style={styles.actionRow}>
                  <Pressable style={styles.chipButton} onPress={onPayrollSettings}>
                    <Text style={styles.chipButtonText}>{setup?.canEditSettings ? 'Edit Schedule' : 'View Schedule'}</Text>
                  </Pressable>
                  <Pressable style={styles.chipButton} onPress={onNewRun}>
                    <Text style={styles.chipButtonText}>New Pay Run</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.muteText}>{setup?.state === 'not_activated' ? 'Your company profile is saved. Payroll is not yet activated.' : 'Payroll setup permissions have not been verified.'}</Text>
                {setup?.canActivate ? <Pressable style={styles.button} onPress={onPayrollSettings}>
                  <Text style={styles.buttonText}>Set up payroll schedule</Text>
                </Pressable> : <Text style={styles.muteText}>Ask the company founder to activate payroll or check your payroll access.</Text>}
              </>
            )}
          </View>

          {/* Draft runs (if any) */}
          {isActivated && runsLoading ? <ActivityIndicator color={colors.accent} /> : null}
          {isActivated && runsError ? <View style={styles.card}><Text style={styles.errorText}>{runsError}</Text><Pressable style={styles.chipButton} onPress={() => { void loadRuns(); }}><Text style={styles.chipButtonText}>Retry pay runs</Text></Pressable></View> : null}
          {isActivated && runs && runs.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Recent Pay Runs</Text>
              {runs.slice(0, 20).map((run) => (
                <Pressable key={run.id} style={styles.runRow} onPress={() => onRunPress(run.id)}>
                  <Text style={styles.rowLabel}>{run.periodStart} → {run.periodEnd}</Text>
                  <Text style={styles.accentText}>{run.runStatus.replace(/_/g, ' ')}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Employees header */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Employees</Text>
            <Pressable style={styles.chipButton} onPress={onNewEmployee} disabled={!isActivated || settingsLoading}>
              <Text style={styles.chipButtonText}>+ Add</Text>
            </Pressable>
          </View>

          {isActivated && empLoading ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}
          {isActivated && empError ? <Text style={styles.errorText}>{empError}</Text> : null}
        </>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.employeeRow} onPress={() => onEmployeePress(item)}>
          <View style={styles.employeeInfo}>
            <Text style={styles.employeeName}>{item.legalFirstName} {item.legalSurname}</Text>
            {item.employeeReference ? (
              <Text style={styles.employeeRef}>Ref: {item.employeeReference}</Text>
            ) : null}
          </View>
          <View style={styles.employeeMeta}>
            <Text style={[styles.statusBadge, item.employeeStatus === 'active' ? styles.statusActive : styles.statusInactive]}>
              {item.employeeStatus}
            </Text>
            {item.isDirector ? <Text style={styles.directorBadge}>Director</Text> : null}
          </View>
        </Pressable>
      )}
      ListEmptyComponent={
        isActivated && !empLoading && !empError ? (
          <Text style={styles.muteText}>No employees yet. Tap + Add to create one.</Text>
        ) : null
      }
      onRefresh={() => { void loadSettings(); if (isActivated) { void loadEmployees(); void loadRuns(); } }}
      refreshing={settingsLoading || (isActivated && empLoading)}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 8 },
  sectionLabel: { color: colors.subtle, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: colors.muted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  chipButton: { backgroundColor: colors.inputBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  chipButtonText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  button: { backgroundColor: colors.accent, borderRadius: 12, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.accentText, fontSize: 14, fontWeight: '900' },
  spinner: { marginVertical: 12 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  muteText: { color: colors.muted, fontSize: 14, textAlign: 'center', marginVertical: 8 },
  runRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  accentText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  employeeRow: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  employeeInfo: { flex: 1 },
  employeeName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  employeeRef: { color: colors.muted, fontSize: 12, marginTop: 2 },
  employeeMeta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  statusBadge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', textTransform: 'capitalize' },
  statusActive: { backgroundColor: colors.successBg, color: colors.success },
  statusInactive: { backgroundColor: colors.dangerBg, color: colors.danger },
  directorBadge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.warningBg, color: colors.warning },
});
