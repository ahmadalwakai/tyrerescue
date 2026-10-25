import { useEffect, useRef, useState } from 'react';
import { useLatestRef } from '@/hooks/useLatestRef';
import { StyleSheet, Text, View } from 'react-native';
import { copyToClipboard } from '@/lib/clipboard';
import { formatBookingAddressForCopy } from '@/lib/booking-address';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize } from './theme';

interface Props {
  address?: string | null;
  postcode?: string | null;
  contextKey?: string;
}

export function CopyAddressButton({ address, postcode, contextKey = '' }: Props) {
  const value = formatBookingAddressForCopy(address, postcode);
  const scope = `${contextKey}\n${value}`;
  const currentScope = useLatestRef(scope);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const [state, setState] = useState<{ scope: string; status: 'copying' | 'ok' | 'err' } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const status = state?.scope === scope ? state.status : null;
  const copyAddress = async () => {
    if (!value || inFlight.current) return;
    inFlight.current = true;
    setState({ scope, status: 'copying' });
    try {
      const copied = await copyToClipboard(value);
      if (mounted.current && currentScope.current === scope) setState({ scope, status: copied ? 'ok' : 'err' });
    } catch {
      if (mounted.current && currentScope.current === scope) setState({ scope, status: 'err' });
    } finally { inFlight.current = false; }
  };
  return (
    <View style={styles.container}>
      <AppButton
        label="Copy address"
        variant="secondary"
        fullWidth
        style={styles.button}
        disabled={!value || status === 'copying'}
        loading={status === 'copying'}
        accessibilityLabel="Copy address"
        accessibilityHint={value ? 'Copies the customer address and available postcode.' : 'No address is available to copy.'}
        onPress={() => { void copyAddress(); }}
      />
      {!value ? <Text style={styles.hint}>No address available to copy.</Text> : null}
      {status === 'ok' || status === 'err' ? (
        <View accessibilityLiveRegion="polite">
          <StatusBanner kind={status} message={status === 'ok' ? 'Address copied.' : 'Could not copy address. Please try again.'} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  button: { minHeight: 48 },
  hint: { color: colors.muted, fontSize: fontSize.xs },
});
