import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/auth/context';
import { unlockDriverSession } from '@/auth/biometric-unlock';
import { useI18n } from '@/i18n';
import { colors, radius, spacing } from '@/constants/theme';

/** A local privacy lock. It never unmounts dispatch, signs out or stops GPS. */
export function DriverSessionGate() {
  const { user, sessionIssue, login, retrySession, logout } = useAuth();
  const { t } = useI18n();
  const [locked, setLocked] = useState(true);
  const [privacyCovered, setPrivacyCovered] = useState(AppState.currentState !== 'active');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<'setup' | 'cancelled' | 'failed' | null>(null);
  const [password, setPassword] = useState('');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const alive = useRef(true);
  const promptRunning = useRef(false);
  const userId = user?.id ?? null;
  const identity = useRef(userId);
  identity.current = userId;
  const lockVersion = useRef(0);
  const lockedRef = useRef(true);

  const unlock = useCallback(async () => {
    if (promptRunning.current || !identity.current || Platform.OS === 'web') return;
    promptRunning.current = true;
    const currentIdentity = identity.current;
    const version = lockVersion.current;
    setBusy(true);
    setReason(null);
    try {
      const result = await unlockDriverSession(t('security.facePrompt'), t('common.cancel'));
      if (!alive.current || identity.current !== currentIdentity || version !== lockVersion.current) return;
      if (result.success) { lockedRef.current = false; setLocked(false); }
      else setReason(result.reason);
    } catch {
      if (alive.current && identity.current === currentIdentity && version === lockVersion.current) {
        setReason('failed');
      }
    } finally {
      promptRunning.current = false;
      if (alive.current) {
        setBusy(false);
        // A driver can return before iOS settles the old prompt. The active
        // event skipped it while promptRunning was true; start one fresh prompt
        // after discarding the stale reply instead of leaving a stuck lock.
        if (version !== lockVersion.current && identity.current && lockedRef.current &&
            AppState.currentState === 'active') void unlock();
      }
    }
  }, [t]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; lockVersion.current += 1; };
  }, []);
  useEffect(() => {
    lockVersion.current += 1;
    lockedRef.current = true;
    setLocked(true);
    setPassword('');
    setRecoveryError(null);
    if (userId && AppState.currentState === 'active') void unlock();
  }, [userId, unlock]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setPrivacyCovered(state !== 'active');
      if (state === 'background') {
        lockVersion.current += 1;
        lockedRef.current = true;
        setLocked(true);
        setPassword('');
      } else if (state === 'active' && identity.current) {
        // Native Face ID changes AppState to inactive. Do not lock/re-prompt
        // merely because that system dialog temporarily obscured the app.
        if (lockedRef.current && !promptRunning.current) void unlock();
      }
    });
    return () => subscription.remove();
  }, [unlock]);

  if (!user || Platform.OS === 'web') return null;
  const visible = locked || privacyCovered || sessionIssue != null;
  const recover = async () => {
    if (busy) return;
    setBusy(true);
    setRecoveryError(null);
    try {
      if (password) await login(user.email, password);
      else await retrySession();
      setPassword('');
    } catch { setRecoveryError(t('security.recoveryFailed')); }
    finally { if (alive.current) setBusy(false); }
  };
  return <Modal visible={visible} animationType="none" statusBarTranslucent presentationStyle="fullScreen" onRequestClose={() => {}}>
    <View style={styles.screen} accessibilityViewIsModal>
      <View style={styles.icon}><Ionicons name="scan-outline" size={44} color={colors.accent} /></View>
      <Text style={styles.title}>{t('security.lockTitle')}</Text>
      <Text style={styles.name}>{user.name}</Text>
      <Text style={styles.body}>{t('security.lockBody')}</Text>
      {!locked && sessionIssue ? <View style={styles.recovery}>
        <Text style={styles.body}>{t(sessionIssue === 'removed' ? 'security.sessionRemoved' : 'security.verifySession')}</Text>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password"
          textContentType="password" placeholder={t('auth.password')} placeholderTextColor={colors.muted}
          style={styles.input} accessibilityLabel={t('auth.password')} />
        {recoveryError ? <Text style={styles.error}>{recoveryError}</Text> : null}
        <Pressable style={styles.primary} disabled={busy} onPress={() => { void recover(); }}>
          <Text style={styles.primaryText}>{busy ? t('security.checking') : t('security.verifyButton')}</Text>
        </Pressable>
      </View> : <>
        {reason ? <Text style={styles.body}>{t(reason === 'setup' ? 'security.faceSetup' : 'security.faceRetry')}</Text> : null}
        <Pressable style={styles.primary} disabled={busy || privacyCovered} onPress={() => { void unlock(); }}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t('security.unlock')}</Text>}
        </Pressable>
        {reason === 'setup' ? <Pressable style={styles.link} onPress={() => { void Linking.openSettings(); }}>
          <Text style={styles.linkText}>{t('security.openSettings')}</Text>
        </Pressable> : null}
      </>}
      <Text style={styles.note}>{t('security.trackingUnaffected')}</Text>
      <Pressable style={styles.link} disabled={busy} onPress={() => { void logout(); }}>
        <Text style={styles.mutedLink}>{t('security.signOut')}</Text>
      </Pressable>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, backgroundColor: colors.bg },
  icon: { height: 88, width: 88, borderRadius: 28, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title: { color: colors.text, fontFamily: 'Inter_700Bold', fontSize: 28, textAlign: 'center' },
  name: { color: colors.accent, fontFamily: 'Inter_600SemiBold', fontSize: 18, marginTop: 12 },
  body: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 16, marginBottom: 20 },
  primary: { minHeight: 56, alignSelf: 'stretch', borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  primaryText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 17 },
  note: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 26 },
  link: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  linkText: { color: colors.accent, fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  mutedLink: { color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  recovery: { alignSelf: 'stretch' },
  input: { minHeight: 54, color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 16, marginBottom: 16 },
  error: { color: colors.danger, marginBottom: 12 },
});
