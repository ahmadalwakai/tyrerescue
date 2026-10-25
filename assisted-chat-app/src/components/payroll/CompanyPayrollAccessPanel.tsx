import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '@/components/theme';
import { useTaxApiScope } from '@/hooks/useTaxApiScope';
import { taxRequestMessage } from '@/lib/tax-input';
import { parseCompanyPayrollAccess, assertCompanyPayrollAccessSaved, type CompanyPayrollAccess as Feed } from '@/lib/payroll-panel-response';

export function CompanyPayrollAccessPanel({ companyId }: { companyId: string }) {
  const { scope, call, isCurrent } = useTaxApiScope(`company-access:${companyId}`);
  const [state, setState] = useState<{ scope: object; feed: Feed | null }>({ scope, feed: null });
  const [progress, setProgress] = useState({ scope, loading: true, busy: false });
  const [feedback, setFeedback] = useState<{ scope: object; error: string | null; notice: string | null }>({ scope, error: null, notice: null });
  const lock = useRef<object | null>(null); const read = useRef<object | null>(null);
  const currentFeed = useRef(state); currentFeed.current = state;
  const setLoading = useCallback((loading: boolean) => setProgress((old) => ({ scope, loading, busy: old.scope === scope && old.busy })), [scope]);
  const setBusy = useCallback((busy: boolean) => setProgress((old) => ({ scope, busy, loading: old.scope === scope ? old.loading : true })), [scope]);
  const setError = useCallback((error: string | null) => setFeedback((old) => ({ scope, error, notice: old.scope === scope ? old.notice : null })), [scope]);
  const setNotice = useCallback((notice: string | null) => setFeedback((old) => ({ scope, notice, error: old.scope === scope ? old.error : null })), [scope]);
  const loading = progress.scope === scope ? progress.loading : true; const busy = progress.scope === scope && progress.busy;
  const error = feedback.scope === scope ? feedback.error : null; const notice = feedback.scope === scope ? feedback.notice : null;
  const [email, setEmail] = useState('');
  const path = `/api/admin/tax/companies/${companyId}/members`;
  const load = useCallback(async () => {
    if (!isCurrent() || lock.current) return;
    const request = {}; read.current = request; setState({ scope, feed: null });
    setLoading(true); setError(null); setNotice(null);
    try { const feed = await call('GET', path, undefined, parseCompanyPayrollAccess);
      if (isCurrent() && read.current === request) setState({ scope, feed }); }
    catch (cause) { if (isCurrent() && read.current === request) setError(taxRequestMessage(cause)); }
    finally { if (read.current === request) { read.current = null; if (isCurrent()) setLoading(false); } }
  }, [scope, call, path, isCurrent, setLoading, setError, setNotice]);
  useEffect(() => { lock.current = null; read.current = null; setBusy(false); setEmail(''); void load(); }, [load, setBusy]);
  const change = async (address: string, action: 'grant_payroll' | 'revoke', expectedTargetId?: string) => {
    if (!isCurrent() || lock.current || read.current || currentFeed.current.scope !== scope || !currentFeed.current.feed?.canManage) return;
    const operation = {}; lock.current = operation; setBusy(true); setError(null); setNotice(null);
    try {
      const targetEmail = address.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) throw new Error('Enter an existing administrator’s email address.');
      const before = await call('GET', path, undefined, parseCompanyPayrollAccess);
      if (!isCurrent() || lock.current !== operation) return;
      setState({ scope, feed: before });
      const member = before.members.find((member) => member.email.toLowerCase() === targetEmail);
      if (!before.canManage || member?.isFounder || (action === 'revoke' && (!member || member.userId !== expectedTargetId))) {
        throw new Error('Company access changed while confirming. Refresh and check the administrator before retrying.');
      }
      const feed = await call('PATCH', path, { email: targetEmail, action }, (value) => {
        const saved = parseCompanyPayrollAccess(value);
        assertCompanyPayrollAccessSaved(saved, before, targetEmail, action);
        return saved;
      });
      if (isCurrent() && lock.current === operation) {
        setState({ scope, feed }); setEmail('');
        setNotice(action === 'revoke' ? 'This administrator’s company access was removed.' : 'Payroll access was granted to the verified administrator.');
      }
    } catch (cause) { if (isCurrent() && lock.current === operation) setError(taxRequestMessage(cause)); }
    finally { if (lock.current === operation) { lock.current = null; if (isCurrent()) setBusy(false); } }
  };
  const feed = state.scope === scope ? state.feed : null;
  if (feed && !feed.canManage) return null;
  return <View style={styles.card}>
    <Text style={styles.title}>Payroll team access</Text>
    <Text style={styles.hint}>You can review and approve your own pay run. Sharing payroll access with another administrator is optional. The company founder can grant access to an existing verified admin after activating payroll. No invitation or message is sent.</Text>
    {loading ? <ActivityIndicator color={colors.accent} /> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    <Button label="Refresh access" disabled={busy || loading} onPress={() => { void load(); }} />
    {feed?.canManage ? <>
      {feed.members.map((member) => <View key={member.userId} style={styles.member}><Text style={styles.text}>{member.name} · {member.email}{member.isFounder ? ' · Founder' : ''}</Text><Text style={styles.hint}>{member.capabilities.includes('payroll.settings.write') ? 'Can manage and review payroll' : 'Company access only'}</Text>{!member.isFounder ? <Button label="Remove this company access" disabled={busy || loading} onPress={() => Alert.alert('Remove company access?', `${member.email} will lose access to this company’s payroll. Their admin account remains available.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove access', style: 'destructive', onPress: () => { void change(member.email, 'revoke', member.userId); } }])} /> : null}</View>)}
      <TextInput editable={!busy && !loading} style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Existing admin email" placeholderTextColor={colors.muted} accessibilityLabel="Existing administrator email" />
      <Text style={styles.hint}>Granting payroll access allows employee and pay-data access, payroll settings, and payroll review for this company.</Text>
      <Button label={busy ? 'Saving…' : 'Grant payroll access'} disabled={busy || loading || !email.trim()} onPress={() => Alert.alert('Grant payroll access?', `Allow ${email.trim()} to access and manage this company’s payroll?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Grant access', onPress: () => { void change(email, 'grant_payroll'); } }])} />
    </> : null}
  </View>;
}
function Button({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.45 }]}><Text style={styles.buttonText}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, padding: 16, gap: 12, borderColor: colors.border, borderWidth: 1, borderRadius: 14 }, title: { color: colors.text, fontSize: 15, fontWeight: '800' }, text: { color: colors.text, fontSize: 13 }, hint: { color: colors.muted, fontSize: 12, lineHeight: 19 }, error: { color: colors.danger, lineHeight: 20 }, notice: { color: colors.success, lineHeight: 20 }, member: { gap: 8 }, input: { backgroundColor: colors.inputBg, padding: 12, color: colors.text, borderRadius: 10, borderColor: colors.border, borderWidth: 1 }, button: { minHeight: 46, padding: 12, borderRadius: 10, borderColor: colors.borderStrong, borderWidth: 1, justifyContent: 'center' }, buttonText: { color: colors.accent, fontWeight: '700' } });
