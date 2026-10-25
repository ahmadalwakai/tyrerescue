import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  readAdminNotificationPermissionStatus,
  registerAdminPushNotifications,
  requestAdminNotificationPermission,
  sendAdminNotificationTest,
} from '@/lib/notifications';
import { ApiError, getApiContextRevision } from '@/lib/api';
import { isNotificationStartupDisabled } from '@/lib/notification-startup-config';
import { colors, fontSize, radius, space } from '../theme';

interface NotificationReliabilityCardProps {
  /** Optional accessible label for the surrounding region. */
  testID?: string;
  onSetupChanged?: () => void;
  onStatusChanged?: (status: NotificationHealthStatus) => void;
  language?: 'en' | 'ar';
}

const copy = {
  en: {
    title: 'Booking notification setup', notifications: 'Notifications', registration: 'Device registration', device: 'Device',
    allowed: 'Allowed', blocked: 'Blocked', notAllowed: 'Not allowed yet', registered: 'Registered', notSynced: 'Not synced',
    unavailable: 'Unavailable in this build', waiting: 'Waiting', web: 'web', iphone: 'iPhone', android: 'Android',
    iosBody: 'For emergency and scheduled online booking alerts on iPhone, allow Notifications, Sounds, Badges, and Lock Screen alerts for this app.',
    androidBody: 'For emergency and scheduled online booking alerts, allow notifications, sound, lock screen notifications, and unrestricted battery usage for this app.',
    webBody: 'Push notifications are not available in the browser preview. Use the installed Assisted Chat app.',
    enable: 'Enable notifications', enableLabel: 'Enable booking notifications', test: 'Send test notification',
    testLabel: 'Send a test notification to this device only', sending: 'Sending test…', retryIn: 'Test again in', seconds: 's',
    openIphoneSettings: 'Open iPhone settings', openNotificationSettings: 'Open notification settings',
    openNotificationSettingsLabel: 'Open notification settings for this app', openAppSettings: 'Open app settings',
    openAppSettingsLabel: 'Open app system settings',
    registrationUnconfirmed: 'Permission is allowed, but registration with the server was not confirmed. Try again.',
    verificationFailed: 'Could not verify notification registration. Try again.',
    buildUnavailable: 'Push notifications are not enabled in this build.',
    permissionBlocked: 'Notifications are blocked. Open settings and allow notifications for this app.',
    registrationConfirmed: 'This device is registered for booking notifications. Delivery has not been tested.',
    registrationFailed: 'Permission is allowed, but device registration did not sync. Try again on the installed app.',
    enableFailed: 'Could not enable notifications. Open settings and try again.',
    testAccepted: 'The push service accepted your test. Look for the test notification on this device. Delivery is not confirmed by the app; Focus and notification settings may silence it.',
    serverUpdateRequired: 'Notification testing is not available on this server yet. The server update must be deployed first.',
    rateLimited: 'Please wait before sending another test notification.',
    sessionRequired: 'Verify this device session before sending a test notification.',
    registrationRequired: 'Enable notifications on this device, then try the test again.',
    testFailed: 'The test was not confirmed. Check the connection and enable notifications again before retrying.',
    iosDisclaimer: 'iPhone lock-screen, sound, and badge controls are managed in iOS Settings.',
    androidDisclaimer: 'Android cannot guarantee a forceful popup on every device.',
  },
  ar: {
    title: 'إعداد إشعارات الحجوزات', notifications: 'الإشعارات', registration: 'تسجيل الجهاز', device: 'الجهاز',
    allowed: 'مسموح', blocked: 'محظور', notAllowed: 'لم يُسمح بعد', registered: 'مسجّل', notSynced: 'لم تتم المزامنة',
    unavailable: 'غير متاح في هذا الإصدار', waiting: 'بانتظار التحقق', web: 'المتصفح', iphone: 'آيفون', android: 'أندرويد',
    iosBody: 'لتلقي إشعارات حجوزات الطوارئ والمواعيد على الآيفون، اسمح بالإشعارات والأصوات والشارات وتنبيهات شاشة القفل لهذا التطبيق.',
    androidBody: 'لتلقي إشعارات حجوزات الطوارئ والمواعيد، اسمح بالإشعارات والصوت وتنبيهات شاشة القفل، وألغِ قيود البطارية لهذا التطبيق.',
    webBody: 'الإشعارات الخارجية غير متاحة في معاينة المتصفح. استخدم تطبيق Assisted Chat المثبّت على الجهاز.',
    enable: 'تفعيل الإشعارات', enableLabel: 'تفعيل إشعارات الحجوزات', test: 'إرسال إشعار تجريبي',
    testLabel: 'إرسال إشعار تجريبي إلى هذا الجهاز فقط', sending: 'جارٍ إرسال الاختبار…', retryIn: 'إعادة الاختبار بعد', seconds: ' ثانية',
    openIphoneSettings: 'فتح إعدادات الآيفون', openNotificationSettings: 'فتح إعدادات الإشعارات',
    openNotificationSettingsLabel: 'فتح إعدادات إشعارات هذا التطبيق', openAppSettings: 'فتح إعدادات التطبيق',
    openAppSettingsLabel: 'فتح إعدادات التطبيق في النظام',
    registrationUnconfirmed: 'صلاحية الإشعارات مسموحة، لكن تسجيل الجهاز على الخادم لم يتأكد. حاول مرة أخرى.',
    verificationFailed: 'تعذر التحقق من تسجيل الإشعارات. حاول مرة أخرى.',
    buildUnavailable: 'الإشعارات الخارجية غير مفعّلة في هذا الإصدار.',
    permissionBlocked: 'الإشعارات محظورة. افتح الإعدادات واسمح بإشعارات هذا التطبيق.',
    registrationConfirmed: 'هذا الجهاز مسجّل لتلقي إشعارات الحجوزات. لم يُختبر وصولها بعد.',
    registrationFailed: 'صلاحية الإشعارات مسموحة، لكن تسجيل الجهاز لم تتم مزامنته. حاول من التطبيق المثبّت.',
    enableFailed: 'تعذر تفعيل الإشعارات. افتح الإعدادات وحاول مرة أخرى.',
    testAccepted: 'قبلت خدمة الإرسال الاختبار. ابحث عن الإشعار التجريبي على هذا الجهاز. التطبيق لا يؤكد وصوله؛ قد تمنع إعدادات الإشعارات أو نمط التركيز ظهوره أو صوته.',
    serverUpdateRequired: 'اختبار الإشعارات غير متاح على هذا الخادم بعد. يلزم نشر تحديث الخادم أولًا.',
    rateLimited: 'انتظر قليلًا قبل إرسال إشعار تجريبي آخر.',
    sessionRequired: 'تحقق من جلسة هذا الجهاز قبل إرسال إشعار تجريبي.',
    registrationRequired: 'فعّل الإشعارات على هذا الجهاز، ثم أعد الاختبار.',
    testFailed: 'لم يتأكد إرسال الاختبار. تحقق من الاتصال وفعّل الإشعارات مجددًا قبل إعادة المحاولة.',
    iosDisclaimer: 'تُدار إشعارات شاشة القفل والأصوات والشارات من إعدادات iOS.',
    androidDisclaimer: 'لا يضمن أندرويد ظهور نافذة تنبيه منبثقة على كل الأجهزة.',
  },
} as const;
type Copy = typeof copy.en | typeof copy.ar;
type NoticeKey = keyof typeof copy.en;

type PermissionStatus = 'granted' | 'denied' | 'undetermined';
type PushSyncStatus = 'idle' | 'synced' | 'failed' | 'unavailable';
type TestStatus = 'not_tested' | 'sending' | 'accepted' | 'failed';
export interface NotificationHealthStatus {
  permission: PermissionStatus;
  pushSync: PushSyncStatus;
  testStatus: TestStatus;
}

async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // Best-effort — some OEM builds disallow programmatic settings open.
  }
}

async function openNotificationSettings(): Promise<void> {
  if (Platform.OS !== 'android') {
    await openAppSettings();
    return;
  }
  // Standard Android intent to land on this app's notification settings.
  // If the device blocks the intent (rare), fall back to app settings.
  try {
    await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
      { key: 'android.provider.extra.APP_PACKAGE', value: 'uk.tyrerescue.assistedchat' },
    ]);
  } catch {
    await openAppSettings();
  }
}

function statusText(status: PermissionStatus, text: Copy): string {
  if (status === 'granted') return text.allowed;
  if (status === 'denied') return text.blocked;
  return text.notAllowed;
}

function statusTone(status: PermissionStatus): 'ok' | 'bad' | 'warn' {
  if (status === 'granted') return 'ok';
  if (status === 'denied') return 'bad';
  return 'warn';
}

function pushStatusText(status: PushSyncStatus, text: Copy): string {
  if (status === 'synced') return text.registered;
  if (status === 'failed') return text.notSynced;
  if (status === 'unavailable') return text.unavailable;
  return text.waiting;
}

/**
 * Admin setup card for online booking notifications. This is not just a
 * settings shortcut: it reads permission state, requests notification access,
 * and syncs the push token to the backend when the native module is available.
 */
export function NotificationReliabilityCard({ testID, onSetupChanged, onStatusChanged, language = 'en' }: NotificationReliabilityCardProps) {
  const text = copy[language];
  const startupDisabled = isNotificationStartupDisabled();
  const [permission, setPermission] = useState<PermissionStatus>('undetermined');
  const [pushSync, setPushSync] = useState<PushSyncStatus>(
    Platform.OS === 'web' || startupDisabled ? 'unavailable' : 'idle',
  );
  const [testStatus, setTestStatus] = useState<TestStatus>('not_tested');
  const [testRetryAt, setTestRetryAt] = useState(0);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeKey | null>(null);
  const mounted = useRef(true);
  const testInFlight = useRef(false);
  const requestSequence = useRef(0);
  const setupChanged = useRef(onSetupChanged);
  const statusChanged = useRef(onStatusChanged);
  setupChanged.current = onSetupChanged;
  statusChanged.current = onStatusChanged;

  useEffect(() => {
    statusChanged.current?.({ permission, pushSync, testStatus });
  }, [permission, pushSync, testStatus]);

  useEffect(() => {
    if (!testRetryAt) return;
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= testRetryAt) setTestRetryAt(0);
    }, 1_000);
    return () => clearInterval(interval);
  }, [testRetryAt]);

  const platformName = Platform.OS === 'ios' ? text.iphone : Platform.OS === 'android' ? text.android : text.web;
  const bodyText = Platform.OS === 'ios' ? text.iosBody : Platform.OS === 'android' ? text.androidBody : text.webBody;

  const refreshStatus = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const revision = getApiContextRevision();
    const isCurrent = () => mounted.current && sequence === requestSequence.current && revision === getApiContextRevision();
    if (Platform.OS === 'web' || startupDisabled) {
      setPushSync('unavailable');
      setPermission('undetermined');
      return;
    }
    setBusy(true);
    try {
      const nextPermission = await readAdminNotificationPermissionStatus();
      if (!isCurrent()) return;
      setPermission(nextPermission);
      const token = nextPermission === 'granted' ? await registerAdminPushNotifications() : null;
      if (!isCurrent()) return;
      setPushSync(token ? 'synced' : nextPermission === 'granted' ? 'failed' : 'idle');
      setNotice(nextPermission === 'granted' && !token
        ? 'registrationUnconfirmed' : null);
      setupChanged.current?.();
    } catch {
      if (!isCurrent()) return;
      setPushSync('failed');
      setNotice('verificationFailed');
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }, [startupDisabled]);

  useEffect(() => {
    mounted.current = true;
    void refreshStatus();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshStatus();
    });
    return () => {
      mounted.current = false;
      requestSequence.current += 1;
      subscription.remove();
    };
  }, [refreshStatus]);

  const handleEnable = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const revision = getApiContextRevision();
    const isCurrent = () => mounted.current && sequence === requestSequence.current && revision === getApiContextRevision();
    if (Platform.OS === 'web' || startupDisabled) {
      setPushSync('unavailable');
      setNotice('buildUnavailable');
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const nextPermission = await requestAdminNotificationPermission();
      if (!isCurrent()) return;
      setPermission(nextPermission);
      if (nextPermission !== 'granted') {
        setPushSync('failed');
        setNotice('permissionBlocked');
        setupChanged.current?.();
        return;
      }

      const token = await registerAdminPushNotifications();
      if (!isCurrent()) return;
      if (token) {
        setPushSync('synced');
        setNotice('registrationConfirmed');
        setupChanged.current?.();
        return;
      }

      setPushSync('failed');
      setNotice('registrationFailed');
      setupChanged.current?.();
    } catch {
      if (!isCurrent()) return;
      setPushSync('failed');
      setNotice('enableFailed');
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }, [startupDisabled]);

  const handleTest = useCallback(async () => {
    if (testInFlight.current || busy || pushSync !== 'synced' || testRetryAt > Date.now()) return;
    testInFlight.current = true;
    const sequence = ++requestSequence.current;
    const revision = getApiContextRevision();
    const isCurrent = () => mounted.current && sequence === requestSequence.current && revision === getApiContextRevision();
    setBusy(true);
    setTestStatus('sending');
    setNotice(null);
    const startedAt = Date.now();
    setNow(startedAt);
    setTestRetryAt(startedAt + 60_000);
    try {
      await sendAdminNotificationTest();
      if (!isCurrent()) return;
      setTestStatus('accepted');
      setNotice('testAccepted');
    } catch (error) {
      if (!isCurrent()) return;
      setTestStatus('failed');
      if (error instanceof ApiError && error.status === 404) {
        setNotice('serverUpdateRequired');
      } else if (error instanceof ApiError && error.status === 429) {
        const seconds = error.retryAfterSeconds ?? 60;
        setTestRetryAt(Date.now() + seconds * 1_000);
        setNotice('rateLimited');
      } else if (error instanceof ApiError && error.status === 409) {
        setNotice(error.message.startsWith('Verify this device session') ? 'sessionRequired' : 'registrationRequired');
      } else {
        setNotice('testFailed');
      }
    } finally {
      testInFlight.current = false;
      if (isCurrent()) setBusy(false);
    }
  }, [busy, pushSync, testRetryAt]);

  const permissionTone = statusTone(permission);
  const pushTone =
    pushSync === 'synced' ? 'ok' : pushSync === 'failed' || pushSync === 'unavailable' ? 'bad' : 'warn';

  return (
    <View style={[styles.card, language === 'ar' && styles.rtl]} testID={testID}>
      <Text style={styles.title}>{text.title}</Text>
      <Text style={styles.body}>{bodyText}</Text>

      <View style={styles.statusGrid}>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>{text.notifications}</Text>
          <Text style={[styles.statusValue, styles[permissionTone]]}>{statusText(permission, text)}</Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>{text.registration}</Text>
          <Text style={[styles.statusValue, styles[pushTone]]}>
            {pushStatusText(pushSync, text)}
          </Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>{text.device}</Text>
          <Text style={styles.statusValue}>{platformName}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            void handleEnable();
          }}
          disabled={busy || Platform.OS === 'web' || startupDisabled}
          accessibilityRole="button"
          accessibilityLabel={text.enableLabel}
          style={({ pressed }) => [
            styles.primaryButton,
            (busy || Platform.OS === 'web' || startupDisabled) && styles.buttonDisabled,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={styles.primaryButtonLabel}>{text.enable}</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => { void handleTest(); }}
          disabled={busy || pushSync !== 'synced' || testRetryAt > now || Platform.OS === 'web' || startupDisabled}
          accessibilityRole="button"
          accessibilityLabel={text.testLabel}
          style={({ pressed }) => [styles.button,
            (busy || pushSync !== 'synced' || testRetryAt > now || Platform.OS === 'web' || startupDisabled) && styles.buttonDisabled,
            pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>{testStatus === 'sending' ? text.sending
            : testRetryAt > now ? `${text.retryIn} ${Math.ceil((testRetryAt - now) / 1_000)}${text.seconds}` : text.test}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void openNotificationSettings();
          }}
          accessibilityRole="button"
          accessibilityLabel={text.openNotificationSettingsLabel}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>
            {Platform.OS === 'ios' ? text.openIphoneSettings : text.openNotificationSettings}
          </Text>
        </Pressable>
        {Platform.OS === 'android' ? (
          <Pressable
            onPress={() => {
              void openAppSettings();
            }}
            accessibilityRole="button"
            accessibilityLabel={text.openAppSettingsLabel}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonLabel}>{text.openAppSettings}</Text>
          </Pressable>
        ) : null}
      </View>
      {notice ? <Text style={styles.notice}>{text[notice]}</Text> : null}
      <Text style={styles.disclaimer}>
        {Platform.OS === 'ios'
          ? text.iosDisclaimer : text.androidDisclaimer}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rtl: { direction: 'rtl' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.sm,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  body: {
    color: colors.muted,
    fontSize: fontSize.sm,
  },
  statusGrid: {
    gap: space.sm,
    marginTop: space.xs,
  },
  statusItem: {
    backgroundColor: colors.cardMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space.md,
    gap: space.xxs,
  },
  statusLabel: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  ok: {
    color: colors.success,
  },
  warn: {
    color: colors.warning,
  },
  bad: {
    color: colors.danger,
  },
  actions: {
    flexDirection: 'column',
    gap: space.sm,
    marginTop: space.xs,
  },
  primaryButton: {
    minHeight: 48,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonPressed: {
    backgroundColor: colors.accentPressed,
  },
  primaryButtonLabel: {
    color: colors.accentText,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  button: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    backgroundColor: colors.card,
  },
  buttonLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  notice: {
    color: colors.muted,
    fontSize: fontSize.sm,
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space.md,
  },
  disclaimer: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    marginTop: space.xs,
  },
});
