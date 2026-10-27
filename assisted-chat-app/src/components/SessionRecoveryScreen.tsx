import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

/** A storage interruption is recoverable; it must never silently erase login. */
export function SessionRecoveryScreen({ message, onRetry, onLogout }: {
  message: string | null;
  onRetry: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setActionError(null);
    try { await action(); }
    catch { if (mounted.current) setActionError('Could not complete this action. Please try again.'); }
    finally { if (mounted.current) setBusy(false); }
  };
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Restore saved sign-in</Text>
      <Text style={styles.message}>{message || 'Your saved sign-in could not be read. Please try again.'}</Text>
      {actionError ? <Text style={styles.message} accessibilityRole="alert">{actionError}</Text> : null}
      {busy ? <ActivityIndicator color={colors.accent} /> : null}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(onRetry); }} style={styles.primary}>
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(onLogout); }} style={styles.secondary}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 28, gap: 18 },
  title: { color: colors.text, fontSize: 23, fontWeight: '700' },
  message: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  primary: { backgroundColor: colors.accent, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  secondary: { borderWidth: 1, borderColor: colors.border, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: '700' },
});
