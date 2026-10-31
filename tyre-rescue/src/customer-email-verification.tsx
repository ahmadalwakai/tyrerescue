import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { CustomerApiError } from './api';
import { colors } from './theme';
import { Card, InlineNotice, PrimaryButton } from './ui';

interface Props {
  resendVerification: () => Promise<string>;
  refresh: () => Promise<void>;
  refreshing: boolean;
  offline: boolean;
}

export function CustomerEmailVerification({ resendVerification, refresh, refreshing, offline }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(false);
  const sending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  async function resend() {
    if (sending.current || offline || Date.now() < retryAt) return;
    sending.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await resendVerification();
      if (!alive.current) return;
      setMessage(result);
      const sentAt = Date.now(); setNow(sentAt); setRetryAt(sentAt + 60_000);
    } catch (reason) {
      if (!alive.current) return;
      setError(reason instanceof Error ? reason.message : 'Unable to resend verification. Please try again.');
      if (reason instanceof CustomerApiError && reason.status === 429) {
        const limitedAt = Date.now(); setNow(limitedAt);
        setRetryAt(limitedAt + (reason.retryAfterSeconds ?? 60) * 1000);
      }
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return <Card>
    <Text style={{ color: colors.text }}>Verify your email to securely link your previous bookings. If your link expired or did not arrive, request another email.</Text>
    {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}
    {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
    <PrimaryButton variant="secondary" loading={busy} disabled={offline || remaining > 0} onPress={() => void resend()}>
      {remaining > 0 ? `Resend available in ${remaining}s` : 'Resend verification email'}
    </PrimaryButton>
    <PrimaryButton variant="secondary" loading={refreshing} onPress={() => void refresh()}>I have verified my email</PrimaryButton>
  </Card>;
}
