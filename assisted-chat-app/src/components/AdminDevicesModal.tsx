import { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAdminDevices } from '@/hooks/useAdminDevices';
import { useAdminSession } from '@/hooks/useAdminSession';
import { useAccountPreferences } from '@/hooks/useAccountPreferences';
import { getApiBaseUrl } from '@/lib/api';
import { formatAccountTimestamp } from '@/lib/account-preferences';
import { adminDeviceActivity, adminDeviceTitle, formatAdminDeviceTimestamp, type AdminDeviceSession } from '@/types/admin-devices';
import { AdminModalHeader, AdminModalShell } from './layout/AdminModalShell';
import { AppButton, InlineNotice } from './ui';
import { colors, fontSize, radius, space } from './theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCurrentDeviceRemoved: () => Promise<void> | void;
}

function confirmRemoval(item: AdminDeviceSession, language: 'en' | 'ar' = 'en'): Promise<boolean> {
  const ar = language === 'ar';
  const title = ar ? item.isCurrent ? 'إزالة هذا الجهاز؟' : 'إزالة هذه الجلسة؟' : item.isCurrent ? 'Remove this device?' : 'Remove this session?';
  const message = ar ? item.isCurrent
    ? `هل تريد إزالة ${adminDeviceTitle(item)}؟ سيُسجّل خروج هذا الجهاز وستحتاج إلى تسجيل الدخول مجددًا.`
    : `هل تريد إزالة ${adminDeviceTitle(item)}؟ ستنتهي صلاحية هذه الجلسة وتحتاج إلى تسجيل الدخول مجددًا.` : item.isCurrent
    ? `Remove ${adminDeviceTitle(item)}? This signs you out of this app on this device. You will need to sign in again.`
    : `Remove ${adminDeviceTitle(item)}? This session will lose access. It will need to sign in again.`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: ar ? 'إلغاء' : 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: ar ? 'إزالة الجلسة' : 'Remove session', style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export function AdminDevicesModal({ visible, onClose, onCurrentDeviceRemoved }: Props) {
  const [busy, setBusy] = useState(false);
  const session = useAdminSession();
  const preferences = useAccountPreferences({ visible, userId: session.user?.id, apiBaseUrl: getApiBaseUrl() });
  const ar = preferences.preferences.language === 'ar';
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!busy) onClose(); }}>
      <AdminModalShell keyboardAvoidingEnabled={false}>
        <AdminModalHeader title={ar ? 'الأجهزة والجلسات' : 'Devices & sessions'} closeLabel={ar ? 'إغلاق' : 'Close'} onClose={busy ? undefined : onClose} />
        <AdminDevicesPanel enabled={visible} onCurrentDeviceRemoved={onCurrentDeviceRemoved} onBusyChange={setBusy}
          language={preferences.preferences.language} formatTimestamp={(value) => formatAccountTimestamp(value, preferences.preferences)} />
      </AdminModalShell>
    </Modal>
  );
}

/** Reuse the same device controls inside account settings without stacking modals. */
export function AdminDevicesPanel({ enabled, onCurrentDeviceRemoved, onBusyChange, formatTimestamp, language = 'en' }: {
  enabled: boolean;
  onCurrentDeviceRemoved: Props['onCurrentDeviceRemoved'];
  onBusyChange?: (busy: boolean) => void;
  formatTimestamp?: (value: string | null, now: number) => string;
  language?: 'en' | 'ar';
}) {
  const devices = useAdminDevices(enabled, onCurrentDeviceRemoved);
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [enabled]);
  const busy = devices.busyId !== null;
  const ar = language === 'ar';
  const label = (en: string, arabic: string) => ar ? arabic : en;
  const activity = (item: AdminDeviceSession) => {
    const value = adminDeviceActivity(item, now);
    if (!ar) return value;
    return value === 'Removed' ? 'تمت الإزالة' : value === 'Activity not recorded' ? 'النشاط غير مسجل'
      : value === 'Active recently' ? 'نشط مؤخرًا' : 'لا يوجد نشاط حديث داخل التطبيق';
  };
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  return (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <Text style={styles.copy}>{label('Sessions for your admin account. Removing a session ends its access.', 'جلسات حساب الأدمن. إزالة الجلسة تنهي وصولها إلى الحساب.')}</Text>
          <Text style={styles.hint}>{label('Times use Europe/London (GMT/BST). “Active recently” means app activity within 2 minutes; it does not guarantee the device is online. Server contact can continue in the background.', 'التوقيت حسب لندن. «نشط مؤخرًا» يعني نشاطًا داخل التطبيق خلال دقيقتين ولا يضمن اتصال الجهاز الآن. قد يستمر الاتصال بالخادم في الخلفية.')}</Text>
          <AppButton label={label('Refresh devices', 'تحديث الأجهزة')} variant="secondary" loading={devices.loading} disabled={busy} onPress={() => { void devices.refresh(); }} />
          {devices.error ? <InlineNotice kind="err">{devices.error}</InlineNotice> : null}
          {!devices.loading && devices.feed.items.length === 0 && !devices.error ? <Text style={styles.copy}>{label('No sessions are available for this account.', 'لا توجد جلسات متاحة لهذا الحساب.')}</Text> : null}
          {devices.feed.items.map((item) => (
            <View key={item.id} style={[styles.card, item.revokedAt ? styles.removed : null]}>
              <View style={styles.cardHeader}>
                <Text style={styles.title}>{adminDeviceTitle(item)}</Text>
                {item.isCurrent ? <Text style={styles.badge}>{label('This device', 'هذا الجهاز')}</Text> : null}
              </View>
              <Text style={[styles.activity, adminDeviceActivity(item, now) === 'Active recently' && styles.recent]}>{activity(item)}</Text>
              <Timestamp label={label('Session started', 'بداية الجلسة')} value={item.createdAt} now={now} formatter={formatTimestamp} />
              <Timestamp label={label('Last sign-in', 'آخر تسجيل دخول')} value={item.lastLoginAt} now={now} formatter={formatTimestamp} />
              <Timestamp label={label('Last app activity', 'آخر نشاط داخل التطبيق')} value={item.lastActiveAt} now={now} formatter={formatTimestamp} />
              <Timestamp label={label('Last server contact', 'آخر اتصال بالخادم')} value={item.lastSeenAt} now={now} formatter={formatTimestamp} />
              {item.revokedAt ? <Timestamp label={label('Removed', 'تاريخ الإزالة')} value={item.revokedAt} now={now} formatter={formatTimestamp} /> : null}
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === item.id }} onPress={() => setExpanded(expanded === item.id ? null : item.id)} style={styles.detailsButton}>
                <Text style={styles.detailsLink}>{expanded === item.id ? label('Hide details', 'إخفاء التفاصيل') : label('Device details', 'تفاصيل الجهاز')}</Text>
              </Pressable>
              {expanded === item.id ? <View style={styles.details}>
                <Detail label={label('Model', 'الطراز')} value={item.modelName} />
                <Detail label={label('Platform', 'المنصة')} value={item.platform} />
                <Detail label={label('OS version', 'إصدار النظام')} value={item.osVersion} />
                <Detail label={label('App version', 'إصدار التطبيق')} value={item.appVersion} />
                <Detail label={label('First IP address', 'أول عنوان IP')} value={item.firstIp} />
                <Detail label={label('Last IP address', 'آخر عنوان IP')} value={item.lastIp} />
                <Text style={styles.hint}>{label('An IP address identifies a network connection; it is not a precise device location.', 'عنوان IP يحدد اتصال الشبكة ولا يحدد موقع الجهاز بدقة.')}</Text>
              </View> : null}
              {!item.revokedAt ? <AppButton label={item.isCurrent ? label('Remove this device', 'إزالة هذا الجهاز') : label('Remove session', 'إزالة الجلسة')} variant="danger" disabled={busy || devices.loading} loading={devices.busyId === item.id} onPress={() => { void devices.remove(item, (target) => confirmRemoval(target, language)); }} /> : null}
            </View>
          ))}
          <Text style={styles.hint}>{label('Older sessions may have no recorded device details, sign-in time or activity. Up to 100 active and recently removed sessions are shown.', 'قد لا تتوفر تفاصيل الجهاز أو أوقات الدخول والنشاط للجلسات القديمة. تظهر حتى 100 جلسة نشطة أو أُزيلت مؤخرًا.')}</Text>
        </ScrollView>
  );
}

function Timestamp({ label, value, now, formatter = formatAdminDeviceTimestamp }: { label: string; value: string | null; now: number; formatter?: (value: string | null, now: number) => string }) {
  return <Detail label={label} value={formatter(value, now)} />;
}
function Detail({ label, value }: { label: string; value: string | null }) {
  return <View style={styles.detail}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value || 'Not recorded'}</Text></View>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: space.md, gap: space.md, paddingBottom: space.xxl },
  copy: { color: colors.text, fontSize: fontSize.sm, lineHeight: 21 },
  hint: { color: colors.muted, fontSize: fontSize.xs, lineHeight: 19 },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  removed: { opacity: 0.8 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: space.sm },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700', flexShrink: 1 },
  badge: { color: colors.info, borderWidth: 1, borderColor: colors.info, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, fontSize: fontSize.xs },
  activity: { color: colors.muted, fontSize: fontSize.sm },
  recent: { color: colors.success },
  detail: { gap: 3 },
  label: { color: colors.muted, fontSize: fontSize.xs },
  value: { color: colors.text, fontSize: fontSize.sm, lineHeight: 21 },
  detailsButton: { minHeight: 44, justifyContent: 'center' },
  detailsLink: { color: colors.info, fontSize: fontSize.sm, fontWeight: '600' },
  details: { gap: space.sm },
});
