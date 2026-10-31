import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useCustomerAccount } from './customer-account';
import { loadBookingAccess } from './customer-booking-access';
import { clearCustomerLiveActivities, customerLiveActivityStatus, customerLiveActivityAvailable, listenForCustomerLiveActivityChanges, listenForCustomerLiveActivityTokens,
  resumeCustomerLiveActivities, setLiveActivityAuthResolver, startCustomerLiveActivity, stopCustomerLiveActivity, updateCustomerLiveActivity } from './customer-live-activity';
import { liveRescueContent, type LiveRescueTracking } from './customer-live-activity-state';
import { InlineNotice, PrimaryButton } from './ui';

export function CustomerLiveActivityBootstrap() {
  const { token, loading, sessionRevision } = useCustomerAccount();
  const tokenRef = useRef(token);
  const previousRevision = useRef(sessionRevision);
  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    setLiveActivityAuthResolver(async refNumber => ({ token: tokenRef.current, access: await loadBookingAccess(refNumber) }));
    const listener = listenForCustomerLiveActivityTokens();
    return () => { listener.remove(); setLiveActivityAuthResolver(null); };
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'ios' || previousRevision.current === sessionRevision) return;
    previousRevision.current = sessionRevision;
    void clearCustomerLiveActivities().catch(() => undefined);
  }, [sessionRevision]);
  useEffect(() => {
    if (Platform.OS !== 'ios' || loading) return;
    const resume = () => { void resumeCustomerLiveActivities().catch(() => undefined); };
    resume();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') resume(); });
    return () => listener.remove();
  }, [loading, sessionRevision, token]);
  return null;
}

export function CustomerLiveActivityControl({ refNumber, tracking, receivedAt }: {
  refNumber: string; tracking: LiveRescueTracking; receivedAt: number;
}) {
  const [available, setAvailable] = useState(false);
  const [phase, setPhase] = useState<'inactive' | 'pending' | 'active'>('inactive');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(false);
  const working = useRef(false);
  const scope = useRef(0);
  const active = phase !== 'inactive';
  useEffect(() => {
    alive.current = true;
    const revision = ++scope.current;
    let statusRequest = 0;
    let availabilityRequest = 0;
    const current = () => alive.current && scope.current === revision;
    setAvailable(false); setPhase('inactive'); setError('');
    if (Platform.OS !== 'ios') return () => { alive.current = false; };
    const refresh = async (checkAvailability = true) => {
      const request = ++statusRequest;
      const availability = checkAvailability ? ++availabilityRequest : 0;
      const [supported, running] = await Promise.allSettled([checkAvailability ? customerLiveActivityAvailable() : Promise.resolve(undefined), customerLiveActivityStatus(refNumber)]);
      if (!current()) return;
      if (availability === availabilityRequest && supported.status === 'fulfilled' && supported.value !== undefined) setAvailable(supported.value);
      // Stopping an existing activity must remain available even while the API is offline.
      if (request === statusRequest && running.status === 'fulfilled') setPhase(running.value);
    };
    void refresh();
    const changes = listenForCustomerLiveActivityChanges(() => { void refresh(false); });
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { alive.current = false; scope.current += 1; changes.remove(); foreground.remove(); };
  }, [refNumber]);
  useEffect(() => {
    if (Platform.OS !== 'ios' || tracking.canChat !== true) return;
    // The lifecycle listener refreshes status after the serialized update settles.
    void updateCustomerLiveActivity(refNumber, liveRescueContent(tracking, receivedAt)).catch(() => undefined);
  }, [receivedAt, refNumber, tracking]);
  async function toggle() {
    if (!alive.current || working.current || tracking.canChat !== true || (!active && tracking.status !== 'en_route')) return;
    const revision = scope.current;
    const current = () => alive.current && scope.current === revision;
    working.current = true; setBusy(true); setError('');
    try {
      if (active) await stopCustomerLiveActivity(refNumber);
      else await startCustomerLiveActivity(refNumber, liveRescueContent(tracking, receivedAt));
      const running = await customerLiveActivityStatus(refNumber);
      if (current()) setPhase(running);
    } catch (reason) { if (current()) setError(reason instanceof Error ? reason.message : 'Unable to update Lock Screen tracking. Please try again.'); }
    finally { working.current = false; if (current()) setBusy(false); }
  }
  if (Platform.OS !== 'ios' || tracking.canChat !== true || (!available && !active) || (!active && tracking.status !== 'en_route')) return null;
  return <>
    <PrimaryButton icon="smartphone" variant="secondary" loading={busy} onPress={() => void toggle()}>
      {active ? 'Stop Lock Screen updates' : 'Follow on Lock Screen'}
    </PrimaryButton>
    {phase === 'pending' ? <InlineNotice>Connecting Lock Screen updates. Keep the app open until this message disappears.</InlineNotice> : null}
    {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
  </>;
}
