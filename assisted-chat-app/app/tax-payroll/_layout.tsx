import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAdminSession } from '@/hooks/useAdminSession';
import { colors } from '@/components/theme';
import { SessionRecoveryScreen } from '@/components/SessionRecoveryScreen';

// Auth guard: if not logged in, bounce back to root.
// This runs before any nested screen mounts.
export default function TaxPayrollLayout() {
  const session = useAdminSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === 'logged-out') {
      router.replace('/');
    }
  }, [session.status, router]);

  if (session.status === 'recovery') {
    return <SessionRecoveryScreen message={session.recoveryError} onRetry={session.retryRestore} onLogout={session.logout} />;
  }
  if (session.status !== 'logged-in') {
    return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text, fontWeight: '900' },
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Tax & Payroll' }} />
      <Stack.Screen name="settings" options={{ title: 'Company Settings' }} />
      <Stack.Screen name="activity" options={{ title: 'Activity Log' }} />
      <Stack.Screen name="monthly-tax" options={{ title: 'Monthly Tax' }} />
      <Stack.Screen name="employees-payroll" options={{ title: 'Employees & Payroll' }} />
      <Stack.Screen name="employees/new" options={{ title: 'Add Employee' }} />
      <Stack.Screen name="employees/[employeeId]" options={{ title: 'Employee' }} />
      <Stack.Screen name="payroll/settings" options={{ title: 'Payroll Settings' }} />
      <Stack.Screen name="payroll/runs/new" options={{ title: 'New Pay Run' }} />
      <Stack.Screen name="payroll/runs/[runId]" options={{ title: 'Pay Run' }} />
      <Stack.Screen name="payroll/runs/[runId]/review" options={{ title: 'Review Pay Run' }} />
      <Stack.Screen name="payroll/runs/[runId]/payslips" options={{ title: 'Payslips' }} />
      <Stack.Screen name="vat" options={{ title: 'VAT' }} />
      <Stack.Screen name="corporation-tax" options={{ title: 'Corporation Tax' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="ledger" options={{ title: 'Trial Balance' }} />
    </Stack>
  );
}
