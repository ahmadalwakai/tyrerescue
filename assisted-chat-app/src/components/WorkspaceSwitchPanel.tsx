import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { getAdminSessionRevision } from '@/hooks/useAdminSession';
import { useAdminWorkspace } from '@/hooks/useAdminWorkspace';
import { useLatestRef } from '@/hooks/useLatestRef';
import { getAdminToken, getApiBaseUrl, getApiContextRevision } from '@/lib/api';
import { AppButton, StatusBanner } from './ui';
import { colors, radius, space } from './theme';

interface Props {
  enabled: boolean;
  language: 'en' | 'ar';
  onBusyChange: (busy: boolean) => void;
}

const COPY = {
  en: {
    intro: 'Choose the workspace for bookings using your current administrator account.',
    shared: 'Quotes, stock, garage and drivers are shared across workspaces.',
    all: 'All workspaces', allInfo: 'View bookings from every connected workspace.',
    current: 'Current workspace', opening: 'Changing workspace…', loading: 'Loading workspaces…', retry: 'Retry',
    failed: 'Could not change workspace. Please try again.',
    loadFailed: 'Could not load workspaces. Check your connection and retry.',
    empty: 'No connected workspaces are available.',
  },
  ar: {
    intro: 'اختر مكان العمل للحجوزات باستخدام حساب الأدمن الحالي.',
    shared: 'عروض الأسعار والمخزون والجراج والسائقون مشتركون بين أماكن العمل.',
    all: 'جميع أماكن العمل', allInfo: 'اعرض الحجوزات من جميع أماكن العمل المرتبطة.',
    current: 'مكان العمل الحالي', opening: 'جارٍ تغيير مكان العمل…', loading: 'جارٍ تحميل أماكن العمل…', retry: 'إعادة المحاولة',
    failed: 'تعذّر تغيير مكان العمل. حاول مجددًا.',
    loadFailed: 'تعذّر تحميل أماكن العمل. تحقق من اتصالك وأعد المحاولة.',
    empty: 'لا توجد أماكن عمل مرتبطة متاحة.',
  },
} as const;

/** Uses the current app account and server catalog; no credentials or backend changes. */
export function WorkspaceSwitchPanel({ enabled, language, onBusyChange }: Props) {
  const workspace = useAdminWorkspace();
  const token = getAdminToken();
  const revision = getAdminSessionRevision();
  const apiRevision = getApiContextRevision();
  const apiBaseUrl = getApiBaseUrl();
  const scope = useMemo(() => ({ enabled, token, revision, apiRevision, apiBaseUrl }),
    [enabled, token, revision, apiRevision, apiBaseUrl]);
  const activeScope = useLatestRef(scope);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const busy = pendingSource !== null;
  const t = COPY[language];
  const rtl = language === 'ar';
  const direction = rtl ? styles.rtl : undefined;
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; onBusyChange(false); };
  }, [onBusyChange]);
  const current = useCallback(() => mounted.current && scope.enabled && activeScope.current === scope && Boolean(scope.token)
    && getAdminToken() === scope.token && getAdminSessionRevision() === scope.revision
    && getApiContextRevision() === scope.apiRevision && getApiBaseUrl() === scope.apiBaseUrl, [scope, activeScope]);
  const selectedSource = workspace.selectedWorkspace?.sourceApp ?? null;

  const chooseWorkspace = async (sourceApp: string | null) => {
    if (!current() || inFlight.current || workspace.loading || sourceApp === selectedSource) return;
    if (sourceApp !== null && !workspace.items.some((item) => item.sourceApp === sourceApp)) return;
    inFlight.current = true;
    setPendingSource(sourceApp ?? 'all');
    setError(false);
    onBusyChange(true);
    try {
      const switched = await workspace.selectWorkspace(sourceApp, current);
      if (current() && !switched) setError(true);
      // The protected tree remounts with the selected source after success.
    } catch {
      if (current()) setError(true);
    } finally {
      inFlight.current = false;
      if (current()) { setPendingSource(null); onBusyChange(false); }
    }
  };
  const retry = () => {
    if (!current() || inFlight.current || workspace.loading) return;
    setError(false);
    void workspace.refresh();
  };

  if (!enabled || !token) return null;
  const choices = [
    { sourceApp: null, sourceLabel: t.all, description: t.allInfo },
    ...workspace.items,
  ];
  return <View style={styles.content}>
    <Text style={[styles.hint, direction]}>{t.intro}</Text>
    <Text style={[styles.hint, direction]}>{t.shared}</Text>
    {error ? <StatusBanner kind="err" message={t.failed} /> : null}
    {workspace.error ? <>
      <StatusBanner kind="err" message={t.loadFailed} />
      <AppButton label={t.retry} variant="secondary" testID="workspace-retry" disabled={busy || workspace.loading} onPress={retry} fullWidth />
    </> : null}
    {workspace.loading ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={[styles.hint, direction]}>{t.loading}</Text></View> : null}
    {busy ? <Text accessibilityLiveRegion="polite" style={[styles.hint, direction]}>{t.opening}</Text> : null}
    {choices.map((item) => {
      const isCurrent = item.sourceApp === selectedSource;
      const disabled = busy || workspace.loading || isCurrent;
      const isPending = pendingSource === (item.sourceApp ?? 'all');
      return <Pressable key={item.sourceApp ?? 'all'} testID={`workspace-${item.sourceApp ?? 'all'}`} accessibilityRole="button"
        accessibilityLabel={`${item.sourceLabel}${isCurrent ? `, ${t.current}` : ''}`}
        accessibilityState={{ disabled, selected: isCurrent, busy: isPending }}
        disabled={disabled} onPress={() => { void chooseWorkspace(item.sourceApp); }}
        style={({ pressed }) => [styles.workspace, isCurrent && styles.currentWorkspace, pressed && styles.pressed, (busy || workspace.loading) && styles.disabled]}>
        <View style={styles.rowCopy}>
          <Text style={[styles.title, direction]}>{item.sourceLabel}</Text>
          {item.description ? <Text style={[styles.hint, direction]}>{item.description}</Text> : null}
          {isCurrent ? <Text style={[styles.currentLabel, direction]}>{t.current}</Text> : null}
        </View>
        {isPending ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.chevron}>{isCurrent ? '✓' : rtl ? '‹' : '›'}</Text>}
      </Pressable>;
    })}
    {!workspace.loading && !workspace.error && workspace.items.length === 0 ? <Text style={[styles.hint, direction]}>{t.empty}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  workspace: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 82, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  currentWorkspace: { borderColor: colors.accent },
  rowCopy: { flex: 1, gap: 5 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  currentLabel: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  chevron: { color: colors.accent, fontSize: 26 },
  pressed: { opacity: 0.75 }, disabled: { opacity: 0.6 },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
});
