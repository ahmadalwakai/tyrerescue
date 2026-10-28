import { useLayoutEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { api, ApiError, getApiContextRevision } from '@/lib/api';
import { getAdminSessionRevision } from '@/hooks/useAdminSession';
import { useBonlineRequestScope } from '@/hooks/useBonlineRequestScope';
import { useBonlineResource } from '@/hooks/useBonlineResource';
import { createClientMessageId } from '@/lib/chat-sync';
import { normalizeBonlineDestination } from '@/lib/bonline-call-presentation';
import { bonlineOutboundIntents } from '@/lib/bonline-outbound-intents';
import type { BonlineOutboundCapability, BonlineOutboundResult } from '@/types/bonline';
import { AppButton } from './ui';
import { colors, fontSize, space } from './theme';

export interface BonlineCallButtonProps {
  phone: string;
  callId?: string;
  bookingId?: string;
  visible?: boolean;
  disabled?: boolean;
  /** Sharing one capability request across a call list avoids one request per row. */
  capability?: BonlineOutboundCapability | null;
  onRequested?: (result: BonlineOutboundResult) => void;
}

export function BonlineCallButton({ phone, callId, bookingId, visible = true, disabled = false, capability, onRequested }: BonlineCallButtonProps) {
  const destination = normalizeBonlineDestination(phone);
  const context = JSON.stringify([destination, callId ?? '', bookingId ?? '']);
  const authScope = `${getApiContextRevision()}:${getAdminSessionRevision()}`;
  const { scopeKey, captureScope, isCurrent } = useBonlineRequestScope(visible && !disabled, context);
  const capabilityRequest = useBonlineResource<BonlineOutboundCapability>(
    visible && !disabled && Boolean(destination) && capability === undefined,
    '/api/mobile/admin/phone/outbound',
  );
  const available = capability === undefined ? capabilityRequest.data : capability;
  const [busy, setBusy] = useState(false);
  const [, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const confirming = useRef(false);
  const intent = bonlineOutboundIntents.get(authScope, context);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A previous caller or signed-in workspace must not retain action feedback.
    setBusy(false);
    setError(null);
    inFlight.current = false;
    confirming.current = false;
  }, [scopeKey, visible, disabled]);

  const requestCall = () => {
    const scope = captureScope();
    if (!isCurrent(scope) || !destination || available?.enabled !== true || inFlight.current || confirming.current) return;
    confirming.current = true;
    const retry = intent?.status === 'pending' || intent?.status === 'unknown';
    let confirmationConsumed = false;
    Alert.alert(
      retry ? 'Check bOnline call request' : intent ? 'Start another bOnline call' : 'Call through bOnline',
      retry
        ? `Check the existing call request for ${destination}. The same request reference will be reused.`
        : `Request a call to ${destination} through your bOnline business line?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => { if (isCurrent(scope)) confirming.current = false; } },
        {
          text: retry ? 'Check request' : 'Call via bOnline',
          onPress: async () => {
            if (!isCurrent(scope) || inFlight.current || confirmationConsumed) return;
            confirmationConsumed = true;
            confirming.current = false;
            inFlight.current = true;
            setBusy(true);
            setError(null);
            let key: string | null = null;
            try {
              key = bonlineOutboundIntents.begin(authScope, context, createClientMessageId, !retry).idempotencyKey;
              const result = await api.post<BonlineOutboundResult>('/api/mobile/admin/phone/outbound', {
                phone: destination, idempotencyKey: key, confirmed: true,
                ...(callId ? { sourceCallId: callId } : {}), ...(bookingId ? { bookingId } : {}),
              });
              if (!result || !['accepted', 'pending', 'unknown', 'failed'].includes(result.status)
                || typeof result.attemptId !== 'string' || typeof result.message !== 'string') {
                throw new Error('The call request could not be confirmed. Check the existing request before trying again.');
              }
              bonlineOutboundIntents.update(authScope, context, key, result.status, result.message);
              if (isCurrent(scope)) {
                setRevision((value) => value + 1);
                if (result.status === 'accepted') onRequested?.(result);
              }
            } catch (cause) {
              const details = cause instanceof ApiError && cause.details && typeof cause.details === 'object'
                ? cause.details as Partial<BonlineOutboundResult> : null;
              const message = details?.message || (cause instanceof Error ? cause.message : 'Unable to confirm the call request.');
              const status = details?.status === 'failed' ? 'failed' : 'unknown';
              if (key) bonlineOutboundIntents.update(authScope, context, key, status, message);
              if (isCurrent(scope)) { setError(message); setRevision((value) => value + 1); }
            } finally {
              if (isCurrent(scope)) { inFlight.current = false; setBusy(false); }
            }
          },
        },
      ],
      { cancelable: true, onDismiss: () => { if (isCurrent(scope)) confirming.current = false; } },
    );
  };

  if (!visible) return null;
  const label = intent?.status === 'accepted' ? 'Call again via bOnline'
    : intent?.status === 'failed' ? 'Try a new call' : intent ? 'Check call request' : 'Call via bOnline';
  const explanation = !destination ? 'Enter a valid customer phone number.'
    : error || intent?.message || available?.message || capabilityRequest.error || 'Checking bOnline call availability…';

  return (
    <View style={styles.container} testID="bonline-call-button">
      <AppButton label={label} variant="secondary" loading={busy} disabled={disabled || !destination || available?.enabled !== true}
        onPress={requestCall} accessibilityHint="Requests a call through the business bOnline account." />
      <Text style={[styles.note, error ? styles.error : null]} accessibilityLiveRegion="polite">{explanation}</Text>
      {capability === undefined && capabilityRequest.error && !available ? (
        <AppButton label="Check availability again" variant="ghost" onPress={() => void capabilityRequest.refresh()} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.xs },
  note: { color: colors.subtle, fontSize: fontSize.xs, lineHeight: 18 },
  error: { color: colors.danger },
});
