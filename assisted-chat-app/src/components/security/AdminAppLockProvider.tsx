import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space } from '@/components/theme';
import { getAdminSessionRevision, useAdminSession } from '@/hooks/useAdminSession';
import { getAdminToken, getApiBaseUrl, getApiContextRevision } from '@/lib/api';
import { AdminAppLockController, adminAppLockIdentity, type AdminBiometricCapability } from '@/lib/admin-app-lock';
import { authenticateAdminBiometrics, readAdminBiometricCapability } from '@/lib/admin-biometrics';
import { completeManualLogout } from '@/lib/manual-logout';

export interface AdminAppLock {
  enabled: boolean;
  ready: boolean;
  busy: boolean;
  locked: boolean;
  capability: AdminBiometricCapability;
  error: string | null;
  setEnabled(enabled: boolean): Promise<boolean>;
  manualLock(): void;
  unlock(): Promise<boolean>;
  refreshCapability(): Promise<void>;
}

const AppLockContext = createContext<AdminAppLock | null>(null);

export function useAdminAppLock(): AdminAppLock {
  const value = useContext(AppLockContext);
  if (!value) throw new Error('AdminAppLockProvider is required.');
  return value;
}

/** One local gate covers home, Tax & Payroll and every modal without changing the saved session. */
export function AdminAppLockProvider({ children }: { children: ReactNode }) {
  const session = useAdminSession();
  const { logout } = session;
  const apiBaseUrl = getApiBaseUrl();
  const sessionRevision = getAdminSessionRevision();
  const userId = session.user?.id;
  const sessionStatus = session.status;
  const [controller] = useState(() => new AdminAppLockController({
    readPreference: (key) => AsyncStorage.getItem(key),
    writePreference: (key, value) => AsyncStorage.setItem(key, value),
    capability: readAdminBiometricCapability,
    authenticate: authenticateAdminBiometrics,
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const scope = useMemo(() => sessionStatus === 'logged-in' && userId ? {
    apiBaseUrl,
    userId,
    sessionRevision,
  } : null, [apiBaseUrl, sessionRevision, sessionStatus, userId]);
  const identity = adminAppLockIdentity(scope);

  useEffect(() => { void controller.setScope(scope); }, [controller, scope]);

  useEffect(() => {
    controller.setForeground(AppState.currentState === 'active' || AppState.currentState === null);
    const subscription = AppState.addEventListener('change', (next) => {
      // iOS photo pickers, camera/notification permission sheets and biometrics
      // temporarily make the app inactive. Keep their pending chat action alive;
      // an actual move to the background still locks and invalidates auth work.
      if (next === 'inactive') return;
      controller.setForeground(next === 'active');
      if (next === 'active') void controller.refreshCapability();
    });
    return () => subscription.remove();
  }, [controller]);

  const retry = useCallback(() => { void controller.retry(); }, [controller]);
  const openSettings = useCallback(() => {
    void Linking.openSettings().catch(() => Alert.alert('Device settings', 'Open Settings on your iPhone to check Face ID or Touch ID.'));
  }, []);
  const signOut = useCallback(() => {
    const revision = getAdminSessionRevision();
    const token = getAdminToken();
    const baseUrl = getApiBaseUrl();
    const apiRevision = getApiContextRevision();
    const isCurrent = () => getAdminSessionRevision() === revision && getAdminToken() === token
      && getApiBaseUrl() === baseUrl && getApiContextRevision() === apiRevision;
    Alert.alert('Sign out of this device?', 'This is a manual sign-out. App lock never signs you out automatically.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => {
        if (!isCurrent()) return;
        void completeManualLogout(async () => {
          const [notifications, alerts] = await Promise.all([import('@/lib/notifications'), import('@/lib/urgent-alerts')]);
          if (!isCurrent()) return;
          await Promise.allSettled([
            notifications.unregisterAdminPushNotifications(), alerts.clearTopicSubscriptionFlag(isCurrent),
          ]);
        }, logout, 8_000, isCurrent).catch(() => undefined);
      } },
    ]);
  }, [logout]);
  const value = useMemo<AdminAppLock>(() => ({
    enabled: state.enabled,
    ready: state.ready && state.identity === identity,
    busy: state.busy,
    locked: state.locked,
    capability: state.capability,
    error: state.error,
    setEnabled: (enabled) => controller.setEnabled(enabled),
    manualLock: () => controller.manualLock(),
    unlock: () => controller.unlock(),
    refreshCapability: () => controller.refreshCapability(),
  }), [controller, identity, state]);
  const blocked = session.status === 'loading' || (session.status === 'logged-in' &&
    (state.identity !== identity || !state.ready || state.locked));

  return (
    <AppLockContext.Provider value={value}>
      {blocked ? (
        <SafeAreaView style={styles.screen}>
          <View style={styles.card} accessibilityViewIsModal>
            <Text style={styles.brand}>TYRE RESCUE</Text>
            <Text style={styles.title}>{state.ready ? 'Assisted Chat is locked' : 'Protecting your workspace'}</Text>
            <Text style={styles.description}>
              {state.ready ? `Unlock with ${state.capability.label}. Your account is still signed in.` : 'Checking the saved app lock setting…'}
            </Text>
            <Text style={styles.detail}>App lock uses biometrics only. Your iPhone passcode does not bypass this screen.</Text>
            {state.error ? <Text style={styles.error} accessibilityRole="alert">{state.error}</Text> : null}
            {state.ready && !state.capability.available && state.capability.reason ? <Text style={styles.error}>{state.capability.reason}</Text> : null}
            {state.busy || (session.status === 'loading' || !state.ready) && !state.error ? <ActivityIndicator color={colors.accent} accessibilityLabel="Checking app lock" /> : null}
            {state.ready ? (
              <Pressable accessibilityRole="button" disabled={state.busy} onPress={() => { void controller.unlock(); }} style={[styles.primary, state.busy ? styles.disabled : null]}>
                <Text style={styles.primaryText}>{state.busy ? 'Authenticating…' : `Unlock with ${state.capability.label}`}</Text>
              </Pressable>
            ) : state.error ? (
              <Pressable accessibilityRole="button" onPress={retry} style={styles.primary}><Text style={styles.primaryText}>Retry app lock</Text></Pressable>
            ) : null}
            {session.status === 'logged-in' ? (
              <>
                <Pressable accessibilityRole="button" onPress={openSettings} style={styles.secondary}><Text style={styles.secondaryText}>Open device settings</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={signOut} style={styles.secondary}><Text style={styles.signOutText}>Sign out manually</Text></Pressable>
              </>
            ) : null}
          </View>
        </SafeAreaView>
      ) : children}
    </AppLockContext.Provider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', padding: space.xl },
  card: { gap: space.md, width: '100%', maxWidth: 520, alignSelf: 'center' },
  brand: { color: colors.accent, fontWeight: '900', fontSize: 15, letterSpacing: 2 },
  title: { color: colors.text, fontWeight: '900', fontSize: 29 },
  description: { color: colors.muted, fontSize: 17, lineHeight: 25 },
  detail: { color: colors.subtle, fontSize: 13, lineHeight: 20 },
  error: { color: colors.warning, fontSize: 14, lineHeight: 21 },
  primary: { minHeight: 52, padding: space.md, borderRadius: 15, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center' },
  primaryText: { color: '#000000', fontSize: 16, fontWeight: '900' },
  secondary: { minHeight: 48, padding: space.sm, justifyContent: 'center', alignItems: 'center' },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  signOutText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
