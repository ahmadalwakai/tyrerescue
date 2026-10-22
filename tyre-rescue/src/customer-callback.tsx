import { useRef, useState } from 'react';
import { View } from 'react-native';
import { API, requestJson } from './api';
import { Card, InlineNotice, PrimaryButton, ScreenHeader, TextField } from './ui';

export function CustomerCallbackRequest({ name: initialName = '', phone: initialPhone = '', notes = '' }: { name?: string; phone?: string; notes?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function submit() {
    if (inFlight.current || sent) return;
    if (!name.trim()) return setError('Enter your name.');
    if (!/^(?:\+44|0)[\d\s()-]{9,18}$/.test(phone.trim())) return setError('Enter a valid UK phone number.');
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const response = await requestJson<{ success: boolean }>(API.callBack, { method: 'POST', body: JSON.stringify({ name: name.trim(), phone: phone.trim(), notes: notes.slice(0, 500) }) });
      if (!response.success) throw new Error('Your request could not be confirmed. Please call the team.');
      setSent(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to request a call. Please try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (!open) return <PrimaryButton icon="phone-incoming" variant="secondary" onPress={() => setOpen(true)}>Call me back</PrimaryButton>;
  return <Card><View style={{ gap: 12 }}>
    <ScreenHeader title="Request a call" detail="Leave your number and our team will call you. For immediate help, call us directly." />
    {sent ? <InlineNotice tone="success">Your callback request has been received. Keep your phone available.</InlineNotice> : <>
      <TextField label="Your name" value={name} onChangeText={setName} autoComplete="name" maxLength={80} />
      <TextField label="Phone number" value={phone} onChangeText={setPhone} autoComplete="tel" keyboardType="phone-pad" maxLength={30} />
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      <PrimaryButton icon="phone-incoming" loading={busy} onPress={() => { void submit(); }}>Request a callback</PrimaryButton>
      <PrimaryButton variant="ghost" disabled={busy} onPress={() => setOpen(false)}>Cancel</PrimaryButton>
    </>}
  </View></Card>;
}
