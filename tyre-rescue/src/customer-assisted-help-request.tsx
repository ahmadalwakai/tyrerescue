import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useCustomerAccount } from './customer-account';
import { clearCustomerAssistedHelp, customerAssistedHelpSession, loadCustomerAssistedHelp, refreshCustomerAssistedHelp, submitCustomerAssistedHelp, validateAssistedHelpInput, type AssistedHelpInput, type AssistedHelpReceipt } from './customer-assisted-help';
import { PHONE_TEL } from './config';
import { colors } from './theme';
import { Card, InlineNotice, PrimaryButton, Row, ScreenHeader, TextField } from './ui';

interface HelpRequestProps { details?: Omit<AssistedHelpInput, 'name' | 'phone' | 'contactConsent'>; name?: string; phone?: string }
export function CustomerAssistedHelpRequest({ details, name: initialName = '', phone: initialPhone = '' }: HelpRequestProps) {
  const { profile, token, loading, sessionRevision } = useCustomerAccount();
  const ownerId = profile?.id ?? 'guest';
  const stableAccount = !loading && (!token || Boolean(profile));
  const identity = useRef({ ownerId, stableAccount, sessionRevision });
  identity.current = { ownerId, stableAccount, sessionRevision };
  const [session, setSession] = useState(customerAssistedHelpSession);
  const [receipt, setReceipt] = useState<AssistedHelpReceipt | null>(null);
  const [name, setName] = useState(initialName || profile?.name || '');
  const [phone, setPhone] = useState(initialPhone || profile?.phone || '');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const inFlight = useRef(false);
  const current = useCallback(() => active.current && session === customerAssistedHelpSession()
    && identity.current.stableAccount && identity.current.ownerId === ownerId && identity.current.sessionRevision === sessionRevision, [session, ownerId, sessionRevision]);
  useEffect(() => {
    active.current = true;
    setReceipt(null); setLoaded(false);
    if (!stableAccount) return () => { active.current = false; };
    void loadCustomerAssistedHelp(ownerId, session).then(async (saved) => {
      if (!current()) return;
      setReceipt(saved); setLoaded(true);
      if (saved) {
        try { const refreshed = await refreshCustomerAssistedHelp(ownerId, session); if (current()) setReceipt(refreshed); }
        catch { if (current()) setError('Showing your saved request. Refresh when you are connected to check the latest status.'); }
      }
    }).catch(() => { if (current()) { setLoaded(true); setError('Unable to read the saved help request. Please try reopening the app.'); } });
    return () => { active.current = false; };
  }, [ownerId, session, current, stableAccount]);

  async function act(submit: boolean) {
    if (inFlight.current || !current()) return;
    const input = receipt?.input ?? (details ? { ...details, name, phone, contactConsent: consent } : null);
    if (submit && !input) return;
    if (submit && input) { const invalid = validateAssistedHelpInput(input); if (invalid) return setError(invalid); }
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const next = submit ? await submitCustomerAssistedHelp(ownerId, input as AssistedHelpInput, session) : await refreshCustomerAssistedHelp(ownerId, session);
      if (current()) setReceipt(next);
    } catch (failure) {
      if (current()) {
        setError(failure instanceof Error ? failure.message : 'Unable to check your help request. Please try again.');
        const saved = await loadCustomerAssistedHelp(ownerId, session).catch(() => null);
        if (current() && saved) setReceipt(saved);
      }
    } finally { inFlight.current = false; if (current()) setBusy(false); }
  }

  async function startAnother() {
    if (inFlight.current || !current() || !receipt || !['reviewed', 'closed'].includes(receipt.status)) return;
    inFlight.current = true; setBusy(true);
    try {
      await clearCustomerAssistedHelp();
      if (active.current && identity.current.ownerId === ownerId && identity.current.sessionRevision === sessionRevision && identity.current.stableAccount) {
        setReceipt(null); setConsent(false); setError(null); setSession(customerAssistedHelpSession());
      }
    } catch { if (active.current) setError('Unable to remove this saved reference. Please try again.'); }
    finally { inFlight.current = false; if (active.current) setBusy(false); }
  }

  if (!stableAccount || !loaded || (receipt && receipt.ownerId !== ownerId) || (!details && !receipt)) return null;
  return <Card><View style={{ gap: 12 }}>
    <ScreenHeader eyebrow="Tyre size help" title={receipt ? 'Your help request' : 'Let the team identify your tyre'} detail="The team will confirm the tyre size, availability and price with you before a separate booking and payment. This request does not confirm a visit." />
    {receipt ? <>
      <Row label="Help reference" value={receipt.reference} />
      <Row label="Status" value={receipt.status === 'prepared' ? 'Saved — awaiting receipt confirmation' : receipt.status === 'pending' ? 'Received — waiting for the team' : receipt.status === 'reviewed' ? 'Reviewed by the team' : 'Request closed'} />
      <InlineNotice>{receipt.status === 'prepared' ? 'Check status first if the connection was lost. Retrying sends this same saved request.' : receipt.status === 'pending' ? 'Keep your phone available. The team has your vehicle details and location.' : 'The team marked this request as reviewed or closed. Contact us if you have not agreed the tyre size and price yet.'}</InlineNotice>
      <PrimaryButton icon="refresh-cw" loading={busy} onPress={() => { void act(false); }}>Refresh help status</PrimaryButton>
      {receipt.status === 'prepared' ? <PrimaryButton icon="send" loading={busy} onPress={() => { void act(true); }}>Retry this saved request</PrimaryButton> : null}
      <PrimaryButton icon="phone" variant="secondary" onPress={() => { void Linking.openURL(`tel:${PHONE_TEL}`); }}>Call about this request</PrimaryButton>
      {['reviewed', 'closed'].includes(receipt.status) ? <>
        <Text style={{ color: colors.muted }}>Removing this saved reference only clears it from this device. It does not cancel a request with the team. A new help request can then be sent from tyre details.</Text>
        <PrimaryButton variant="ghost" loading={busy} onPress={() => { void startAnother(); }}>Remove saved reference and start again</PrimaryButton>
      </> : null}
    </> : <>
      <Row label="Vehicle" value={[details?.vehicleReg, details?.vehicleMake, details?.vehicleModel].filter(Boolean).join(' ') || 'See attached photo'} />
      <Row label="Vehicle location" value={details?.address ?? ''} />
      <Row label="Tyre photo" value={details?.photoUrl ? 'Attached' : 'Optional — add one above if you can'} />
      <TextField label="Your name" value={name} onChangeText={setName} autoComplete="name" maxLength={80} />
      <TextField label="Phone number" value={phone} onChangeText={setPhone} autoComplete="tel" keyboardType="phone-pad" maxLength={20} />
      <PrimaryButton accessibilityRole="checkbox" accessibilityState={{ checked: consent }} variant="ghost" icon={consent ? 'check-square' : 'square'} onPress={() => setConsent(value => !value)}>I agree to share these details and be contacted about tyre size help</PrimaryButton>
      <Text style={{ color: colors.muted }}>Only the details shown above and your confirmed map pin are sent to our team. No payment is taken.</Text>
      <PrimaryButton icon="send" loading={busy} disabled={!consent} onPress={() => { void act(true); }}>Send tyre size help request</PrimaryButton>
    </>}
    {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
  </View></Card>;
}
