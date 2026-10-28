import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { IncomingPhoneCall } from '@/lib/incoming-phone-call';
import type { IncomingCallerHistoryResult } from '@/lib/incoming-caller-history';
import type { ReturningCustomerMatch } from '@/types/assisted-chat';
import { ReturningCustomerCard } from './ReturningCustomerCard';
import { AppButton, SectionCard } from './ui';
import { colors, fontSize, space } from './theme';

interface Props {
  call: IncomingPhoneCall;
  history: IncomingCallerHistoryResult;
  useDisabledReason: string | null;
  onUse: (match: ReturningCustomerMatch) => void;
  onDismiss: () => void;
  onRetry: () => void;
}

/** Remains readable after the four-second header popup has disappeared. */
export function IncomingCallerHistoryCard({ call, history, useDisabledReason, onUse, onDismiss, onRetry }: Props) {
  const receivedAt = new Date(call.receivedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const helper = `${call.phone} · call received ${receivedAt}`;
  if (history.status === 'found') {
    return (
      <ReturningCustomerCard
        key={call.callId}
        title="Incoming caller history"
        helperText={helper}
        matches={history.matches}
        loading={false}
        useDisabledReason={useDisabledReason}
        onUse={onUse}
        onDismiss={onDismiss}
        dismissLabel="Dismiss caller history"
      />
    );
  }
  const checking = history.status === 'checking' || history.status === 'idle';
  const message = checking ? 'Checking previous bookings for this number…'
    : history.status === 'not_found' ? 'No previous bookings found for this number.'
    : 'Customer history could not be checked. This caller has not been marked as a new customer.';
  return (
    <SectionCard title="Incoming caller history" helperText={helper}>
      <View style={styles.content} accessibilityLiveRegion="polite" testID="incoming-caller-history-status">
        {checking ? <ActivityIndicator color={colors.accent} /> : null}
        <Text style={styles.message}>{message}</Text>
        {history.status === 'unavailable' ? <AppButton label="Retry history check" onPress={onRetry} /> : null}
        <AppButton label="Dismiss caller history" variant="secondary" onPress={onDismiss} />
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.sm },
  message: { color: colors.muted, fontSize: fontSize.sm },
});
