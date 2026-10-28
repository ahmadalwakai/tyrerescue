import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLatestRef } from '@/hooks/useLatestRef';
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { getAdminSessionRevision, useAdminSession } from '@/hooks/useAdminSession';
import { useAccountPreferences } from '@/hooks/useAccountPreferences';
import { getAdminToken, getApiBaseUrl, getApiContextRevision } from '@/lib/api';
import { formatAccountTimestamp } from '@/lib/account-preferences';
import { readAdminDeviceMetadata } from '@/lib/admin-device-metadata';
import { AdminDevicesPanel } from './AdminDevicesModal';
import { AdminModalHeader, AdminModalShell } from './layout/AdminModalShell';
import { NotificationReliabilityCard } from './alerts/NotificationReliabilityCard';
import { useAdminAppLock } from './security/AdminAppLockProvider';
import { AppButton, StatusBanner } from './ui';
import { colors, radius, space } from './theme';

type Page = 'account' | 'devices' | 'notifications' | 'preferences' | 'about';
interface Props {
  visible: boolean;
  onClose: () => void;
  onDismiss: () => void;
  onLogout: () => Promise<void>;
  onNotificationsChanged: () => void;
}

const COPY = {
  en: {
    account: 'My account & settings', devices: 'Devices & sessions', notifications: 'iPhone notifications', preferences: 'Display preferences', about: 'App information',
    close: 'Close', back: 'Back', admin: 'Administrator', project: 'Connected project', workspace: 'Connected workspace',
    security: 'App security', securityInfo: 'Keep your sign-in saved and require biometrics when reopening the app.',
    lock: 'Biometric app lock', lockNow: 'Lock app now', refresh: 'Check biometrics again',
    signedIn: 'Your sign-in stays saved when you close the app. Signing out is a separate manual action.',
    deviceInfo: 'Check last sign-in and activity, and remove a device from your account.',
    notificationInfo: 'Check permissions, register this iPhone and send a test only to this device.',
    preferencesInfo: 'Language for this account screen, time format and iPhone text size.',
    aboutInfo: 'View the installed app version and device information.',
    language: 'Account screen language', languageInfo: 'This changes account/settings labels. Booking screens keep their current language.',
    timeFormat: 'Time format', timeInfo: 'Used here and in the devices list. Times use Europe/London (GMT/BST).',
    textSize: 'Text size', textInfo: 'Text follows your iPhone accessibility text size. Adjust it in iPhone settings.', settings: 'Open device settings',
    saving: 'Saving preferences…', retryPreferences: 'Retry preferences', preferencesRead: 'Saved preferences could not be read. Retry to check them before making changes.', preferencesWrite: 'Preferences were not saved. Please try again.',
    version: 'App version', build: 'Installed build', model: 'Device model', os: 'Operating system',
    unavailable: 'Not recorded', settingsFailed: 'Could not open device settings. Open Settings on your iPhone manually.',
    signOut: 'Sign out of this device', signOutTitle: 'Sign out?', signOutInfo: 'This ends your session on this device. Other devices stay signed in.',
    cancel: 'Cancel', signOutFailed: 'Sign-out could not be completed. Please retry.',
    notificationsNote: 'Registration is checked when you open this page. Test acceptance does not confirm delivery to the iPhone.',
    enabled: 'Enabled', disabled: 'Disabled', noBiometrics: 'Biometrics are not available on this device or installed build.',
  },
  ar: {
    account: 'حسابي وإعداداتي', devices: 'الأجهزة والجلسات', notifications: 'إشعارات الآيفون', preferences: 'تفضيلات العرض', about: 'معلومات التطبيق',
    close: 'إغلاق', back: 'رجوع', admin: 'أدمن', project: 'المشروع المتصل', workspace: 'المشروع المتصل',
    security: 'أمان التطبيق', securityInfo: 'احتفظ بتسجيل الدخول واطلب البصمة عند العودة إلى التطبيق.',
    lock: 'قفل التطبيق بالبصمة', lockNow: 'قفل التطبيق الآن', refresh: 'فحص البصمة مجددًا',
    signedIn: 'إغلاق التطبيق لا يسجّل خروجك. تسجيل الخروج إجراء يدوي مستقل.',
    deviceInfo: 'راجع آخر دخول ونشاط، وأزل جهازًا من حسابك عند الحاجة.',
    notificationInfo: 'راجع الأذونات وتسجيل هذا الآيفون، وأرسل إشعار اختبار إلى هذا الجهاز فقط.',
    preferencesInfo: 'لغة شاشة الحساب وتنسيق الوقت وحجم خط الآيفون.',
    aboutInfo: 'اعرض إصدار التطبيق المثبت ومعلومات الجهاز.',
    language: 'لغة شاشة الحساب', languageInfo: 'يتغير نص شاشة الحساب والإعدادات. تبقى شاشات الحجوزات بلغتها الحالية.',
    timeFormat: 'تنسيق الوقت', timeInfo: 'يُستخدم هنا وفي قائمة الأجهزة. التوقيت حسب لندن مع مراعاة التوقيت الصيفي والشتوي.',
    textSize: 'حجم الخط', textInfo: 'يتبع النص حجم خط تسهيلات الاستخدام في الآيفون. يمكنك تعديله من إعدادات الجهاز.', settings: 'فتح إعدادات الجهاز',
    saving: 'جارٍ حفظ التفضيلات…', retryPreferences: 'إعادة قراءة التفضيلات', preferencesRead: 'تعذّرت قراءة التفضيلات المحفوظة. أعد المحاولة قبل إجراء تغيير.', preferencesWrite: 'لم تُحفظ التفضيلات. حاول مجددًا.',
    version: 'إصدار التطبيق', build: 'رقم النسخة المثبتة', model: 'طراز الجهاز', os: 'نظام التشغيل',
    unavailable: 'غير مسجل', settingsFailed: 'تعذّر فتح إعدادات الجهاز. افتح تطبيق الإعدادات في الآيفون يدويًا.',
    signOut: 'تسجيل الخروج من هذا الجهاز', signOutTitle: 'تسجيل الخروج؟', signOutInfo: 'تنتهي جلسة هذا الجهاز فقط. تبقى الأجهزة الأخرى مسجلة الدخول.',
    cancel: 'إلغاء', signOutFailed: 'تعذّر إكمال تسجيل الخروج. حاول مجددًا.',
    notificationsNote: 'تُفحص حالة التسجيل عند فتح هذه الصفحة. قبول إرسال الاختبار لا يؤكد وصوله إلى الآيفون.',
    enabled: 'مفعّل', disabled: 'غير مفعّل', noBiometrics: 'البصمة غير متاحة على هذا الجهاز أو في النسخة المثبتة.',
  },
} as const;

/** Account controls contain no credential editing and never sign out on close. */
export function AdminAccountModal({ visible, onClose, onDismiss, onLogout, onNotificationsChanged }: Props) {
  const session = useAdminSession();
  const appLock = useAdminAppLock();
  const apiBaseUrl = getApiBaseUrl();
  const token = getAdminToken();
  const revision = getAdminSessionRevision();
  const apiRevision = getApiContextRevision();
  const scope = useMemo(() => ({ visible, token, revision, apiRevision, userId: session.user?.id, apiBaseUrl }), [visible, token, revision, apiRevision, session.user?.id, apiBaseUrl]);
  const activeScope = useLatestRef(scope);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = useCallback(() => mounted.current && scope.visible && activeScope.current === scope && Boolean(scope.token)
    && getAdminToken() === scope.token && getAdminSessionRevision() === scope.revision
    && getApiContextRevision() === scope.apiRevision && getApiBaseUrl() === scope.apiBaseUrl, [scope]);
  const preferences = useAccountPreferences({ visible: visible && session.status === 'logged-in', userId: session.user?.id, apiBaseUrl });
  const [page, setPage] = useState<Page>('account');
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const logoutInFlight = useRef(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  useLayoutEffect(() => { setPage('account'); setNotice(null); }, [visible, token, revision, apiRevision]);
  const metadata = useMemo(() => readAdminDeviceMetadata(), []);
  const buildNumber = String(Platform.OS === 'ios'
    ? Constants.platform?.ios?.buildNumber ?? Constants.expoConfig?.ios?.buildNumber ?? 'Unknown'
    : Constants.expoConfig?.android?.versionCode ?? 'Unknown');
  const appVersion = Constants.expoConfig?.version ?? metadata.appVersion;
  const projectName = session.activeProject?.name ?? COPY.en.workspace;
  const t = COPY[preferences.preferences.language];
  const rtl = preferences.preferences.language === 'ar';
  const direction = rtl ? styles.rtl : undefined;
  const busy = appLock.busy || preferences.saving || deviceBusy || signingOut;
  const origin = useMemo(() => {
    try {
      const url = new URL(apiBaseUrl);
      return ['http:', 'https:'].includes(url.protocol) ? url.origin : t.unavailable;
    } catch { return t.unavailable; }
  }, [apiBaseUrl, t.unavailable]);
  const navigate = (next: Page) => { if (current() && !busy) { setNotice(null); setPage(next); } };
  const close = () => { if (current() && !busy) onClose(); };
  const back = () => { if (page === 'account') close(); else navigate('account'); };
  const openSettings = async () => {
    if (!current() || busy) return;
    try { await Linking.openSettings(); } catch { if (current()) setNotice({ kind: 'err', message: t.settingsFailed }); }
  };
  const performSignOut = async () => {
    if (!current() || logoutInFlight.current || busy) return;
    logoutInFlight.current = true; setSigningOut(true); setNotice(null);
    try { await onLogout(); }
    catch { if (current()) setNotice({ kind: 'err', message: t.signOutFailed }); }
    finally { if (current()) { logoutInFlight.current = false; setSigningOut(false); } }
  };
  const requestSignOut = () => {
    if (!current() || busy) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${t.signOutTitle}\n\n${t.signOutInfo}`)) void performSignOut();
    } else Alert.alert(t.signOutTitle, t.signOutInfo, [
      { text: t.cancel, style: 'cancel' }, { text: t.signOut, style: 'destructive', onPress: () => { void performSignOut(); } },
    ]);
  };
  const row = (target: Page, title: string, description: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={busy} onPress={() => navigate(target)} style={({ pressed }) => [styles.menuRow, pressed && styles.pressed, busy && styles.disabled]}>
      <View style={styles.rowCopy}><Text style={[styles.menuTitle, direction]}>{title}</Text><Text style={[styles.hint, direction]}>{description}</Text></View>
      <Text style={styles.chevron}>{rtl ? '‹' : '›'}</Text>
    </Pressable>
  );
  const information = (label: string, value: string) => <View style={styles.detail}><Text style={[styles.hint, direction]}>{label}</Text><Text selectable style={[styles.value, direction]}>{value}</Text></View>;

  if (session.status !== 'logged-in' || !session.user) return null;
  return (
    <Modal visible={visible} presentationStyle="fullScreen" animationType="slide" onRequestClose={back} onDismiss={onDismiss} accessibilityViewIsModal>
      <AdminModalShell keyboardAvoidingEnabled={false} chrome="plain" style={styles.shell}>
        <AdminModalHeader title={t[page]} closeLabel={page === 'account' ? t.close : t.back} onClose={busy ? undefined : back} style={styles.header} />
        {page === 'devices' ? <AdminDevicesPanel enabled={visible} onBusyChange={setDeviceBusy} language={preferences.preferences.language}
          formatTimestamp={(value) => formatAccountTimestamp(value, preferences.preferences)} onCurrentDeviceRemoved={onLogout} /> :
          <ScrollView contentContainerStyle={styles.content}>
            {notice ? <StatusBanner kind={notice.kind} message={notice.message} /> : null}
            {page === 'account' ? <>
              <View style={styles.identityCard}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{session.user.name.trim().slice(0, 1).toUpperCase()}</Text></View>
                <Text style={[styles.name, direction]}>{session.user.name}</Text>
                <Text selectable style={styles.email}>{session.user.email}</Text>
                <Text style={styles.role}>{t.admin}</Text>
                <View style={styles.separator} />
                {information(t.project, projectName)}
                <Text selectable style={styles.origin}>{origin}</Text>
              </View>
              <View style={styles.card}>
                <Text style={[styles.sectionTitle, direction]}>{t.security}</Text>
                <Text style={[styles.hint, direction]}>{t.securityInfo}</Text>
                <View style={styles.toggleRow}><Text style={[styles.value, styles.rowCopy, direction]}>{t.lock} · {appLock.capability.label}</Text>
                  <Switch accessibilityLabel={t.lock} value={appLock.enabled} disabled={busy || !appLock.ready || !appLock.capability.available}
                    onValueChange={(enabled) => { if (current()) void appLock.setEnabled(enabled); }} />
                </View>
                <Text style={[styles.hint, direction]}>{appLock.enabled ? t.enabled : t.disabled}</Text>
                {appLock.error ? <StatusBanner kind="err" message={appLock.error} /> : null}
                {!appLock.capability.available ? <Text style={[styles.hint, direction]}>{appLock.capability.reason ?? t.noBiometrics}</Text> : null}
                {appLock.enabled ? <AppButton label={t.lockNow} variant="secondary" disabled={busy} onPress={() => { if (current()) appLock.manualLock(); }} fullWidth /> : null}
                {!appLock.capability.available ? <AppButton label={t.refresh} variant="secondary" disabled={busy} onPress={() => { void appLock.refreshCapability(); }} fullWidth /> : null}
              </View>
              {row('devices', t.devices, t.deviceInfo)}
              {row('notifications', t.notifications, t.notificationInfo)}
              {row('preferences', t.preferences, t.preferencesInfo)}
              {row('about', t.about, t.aboutInfo)}
              <Text style={[styles.hint, direction]}>{t.signedIn}</Text>
              <AppButton label={t.signOut} variant="danger" loading={signingOut} disabled={busy} onPress={requestSignOut} fullWidth />
            </> : null}
            {page === 'notifications' ? <>
              <Text style={[styles.hint, direction]}>{t.notificationsNote}</Text>
              <NotificationReliabilityCard key={apiRevision} language={preferences.preferences.language} onSetupChanged={onNotificationsChanged} />
            </> : null}
            {page === 'preferences' ? <>
              {preferences.loading ? <ActivityIndicator color={colors.accent} /> : null}
              {preferences.error ? <StatusBanner kind="err" message={preferences.error === 'read' ? t.preferencesRead : t.preferencesWrite} /> : null}
              {preferences.error === 'read' ? <AppButton label={t.retryPreferences} variant="secondary" disabled={busy || preferences.loading} onPress={preferences.refresh} fullWidth /> : null}
              <View style={styles.card}>
                <Text style={[styles.sectionTitle, direction]}>{t.language}</Text><Text style={[styles.hint, direction]}>{t.languageInfo}</Text>
                <View style={styles.choices}>
                  {(['en', 'ar'] as const).map((language) => <AppButton key={language} label={language === 'ar' ? 'العربية' : 'English'}
                    variant={preferences.preferences.language === language ? 'primary' : 'secondary'} disabled={busy || preferences.loading || preferences.error === 'read'}
                    onPress={() => { void preferences.setPreferences({ language }); }} />)}
                </View>
              </View>
              <View style={styles.card}>
                <Text style={[styles.sectionTitle, direction]}>{t.timeFormat}</Text><Text style={[styles.hint, direction]}>{t.timeInfo}</Text>
                <View style={styles.choices}>
                  {(['24h', '12h'] as const).map((timeFormat) => <AppButton key={timeFormat} label={timeFormat === '24h' ? '24h · 17:30' : '12h · 5:30 PM'}
                    variant={preferences.preferences.timeFormat === timeFormat ? 'primary' : 'secondary'} disabled={busy || preferences.loading || preferences.error === 'read'}
                    onPress={() => { void preferences.setPreferences({ timeFormat }); }} />)}
                </View>
                <Text style={[styles.value, direction]}>{formatAccountTimestamp(new Date(), preferences.preferences)}</Text>
              </View>
              <View style={styles.card}><Text style={[styles.sectionTitle, direction]}>{t.textSize}</Text><Text style={[styles.hint, direction]}>{t.textInfo}</Text>
                <AppButton label={t.settings} variant="secondary" onPress={() => { void openSettings(); }} fullWidth />
              </View>
              {preferences.saving ? <Text style={[styles.hint, direction]}>{t.saving}</Text> : null}
            </> : null}
            {page === 'about' ? <>
              <View style={styles.card}>{information(t.version, appVersion)}{information(t.build, buildNumber)}{information(t.model, metadata.modelName)}{information(t.os, metadata.osVersion)}</View>
            </> : null}
          </ScrollView>}
      </AdminModalShell>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shell: { backgroundColor: '#000000' }, header: { backgroundColor: '#000000' },
  content: { padding: space.md, gap: space.md, paddingBottom: space.xxl },
  identityCard: { padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: space.sm },
  avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  avatarText: { fontSize: 29, fontWeight: '900', color: '#000000' },
  name: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  email: { color: colors.muted, fontSize: 15, textAlign: 'center' }, role: { color: colors.accent, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: space.sm },
  origin: { color: colors.muted, fontSize: 14, writingDirection: 'ltr' },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  value: { color: colors.text, fontSize: 16, lineHeight: 23 }, detail: { gap: 3 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52 }, rowCopy: { flex: 1 },
  menuRow: { padding: space.md, minHeight: 76, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: space.md },
  menuTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 5 }, chevron: { color: colors.accent, fontSize: 31 },
  pressed: { opacity: 0.75 }, disabled: { opacity: 0.5 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
});
