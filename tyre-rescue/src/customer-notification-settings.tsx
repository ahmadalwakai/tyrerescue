import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { useCustomerAccount } from './customer-account';
import { customerNotificationPermission, type CustomerNotificationPermission } from './customer-notification-permissions';
import { readCustomerNotificationPermissionAsync, refreshCustomerPushRegistrationAsync, requestCustomerNotificationPermissionAsync } from './customer-notifications';
import { colors, spacing, typography } from './theme';
import { AppHeader, Card, InlineNotice, PrimaryButton, Row, ScreenHeader, useScreenContentInsets } from './ui';

export function CustomerNotificationSettings() {
  const router = useRouter();
  const account = useCustomerAccount();
  const latestAccount = useRef(account);
  latestAccount.current = account;
  const insets = useScreenContentInsets();
  const [permission, setPermission] = useState<CustomerNotificationPermission>(() => customerNotificationPermission(null, Platform.OS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const revision = ++request.current;
    setBusy(true); setError(null);
    try {
      const next = await readCustomerNotificationPermissionAsync();
      if (mounted.current && revision === request.current) setPermission(next);
    } catch {
      if (mounted.current && revision === request.current) setError('Unable to read notification settings. Please try again.');
    } finally { if (mounted.current && revision === request.current) setBusy(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { mounted.current = false; request.current += 1; listener.remove(); };
  }, [refresh]);

  async function enable() {
    if (busy) return;
    const revision = ++request.current;
    setBusy(true); setError(null);
    try {
      const next = await requestCustomerNotificationPermissionAsync();
      if (!mounted.current || revision !== request.current) return;
      setPermission(next);
      if (next.canReceive && !latestAccount.current.loading && latestAccount.current.token === account.token &&
        latestAccount.current.sessionRevision === account.sessionRevision) await refreshCustomerPushRegistrationAsync(account.token);
    } catch {
      if (mounted.current && revision === request.current) setError('Unable to enable notifications. Check your phone settings and try again.');
    } finally { if (mounted.current && revision === request.current) setBusy(false); }
  }

  async function openSettings() {
    try { await Linking.openSettings(); }
    catch { if (mounted.current) setError('Open your phone settings, then choose Tyre Rescue and Notifications.'); }
  }

  return <ScrollView contentContainerStyle={[styles.content, insets]}>
    <AppHeader onBack={() => router.canGoBack() ? router.back() : router.replace('/account')} />
    <ScreenHeader title="Notifications" detail="Choose how your phone alerts you about your rescue and messages." />
    <Card>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.title}>{permission.label}</Text>
      <Text style={styles.detail}>{permission.detail}</Text>
      {Platform.OS !== 'web' ? <>
        <Row label="Sound" value={permission.sound} />
        <Row label="Banners" value={permission.banners} />
      </> : null}
    </Card>
    {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
    {permission.canRequest ? <PrimaryButton icon="bell" loading={busy} onPress={() => void enable()}>Enable notifications</PrimaryButton> : null}
    {Platform.OS !== 'web' ? <>
      <PrimaryButton icon="settings" variant="secondary" onPress={() => void openSettings()}>Open phone settings</PrimaryButton>
      <PrimaryButton icon="refresh-cw" variant="ghost" loading={busy} onPress={() => void refresh()}>Refresh status</PrimaryButton>
      <Card>
        <Text accessibilityRole="header" style={styles.title}>Booking updates and messages</Text>
        <Text style={styles.detail}>Updates can include payment confirmation, your fitter’s journey, new chat messages and your service report. Notification buttons open the relevant booking in the app.</Text>
        <Text style={styles.detail}>You can also find your latest updates in Track and Chat.</Text>
        {Platform.OS === 'ios' ? <Text style={styles.detail}>Sounds follow your iPhone’s Silent Mode and Focus settings. You can allow Time Sensitive alerts in Settings.</Text> : null}
      </Card>
    </> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { backgroundColor: colors.bg, gap: 16, minHeight: '100%', paddingHorizontal: spacing.page },
  title: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 18, lineHeight: 25 },
  detail: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 22 },
});
