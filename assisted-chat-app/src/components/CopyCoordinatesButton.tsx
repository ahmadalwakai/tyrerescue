import { useEffect, useMemo, useRef, useState } from 'react';
import { useLatestRef } from '@/hooks/useLatestRef';
import { StyleSheet, Text, View } from 'react-native';
import { getApiContextRevision } from '@/lib/api';
import { copyToClipboard } from '@/lib/clipboard';
import { formatBookingCoordinatesForCopy, type BookingCoordinate } from '@/lib/booking-coordinates';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize } from './theme';

interface Props {
  lat: BookingCoordinate;
  lng: BookingCoordinate;
  contextKey: string;
}

interface CopyScope { key: string; revision: number }

export function CopyCoordinatesButton({ lat, lng, contextKey }: Props) {
  const value = formatBookingCoordinatesForCopy(lat, lng);
  const revision = getApiContextRevision();
  const key = JSON.stringify([contextKey, revision, value]);
  const scope = useMemo<CopyScope>(() => ({ key, revision }), [key, revision]);
  const currentScope = useLatestRef(scope);
  const mounted = useRef(false);
  const inFlight = useRef<CopyScope | null>(null);
  const [state, setState] = useState<{ scope: CopyScope; status: 'copying' | 'ok' | 'err' } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const status = state?.scope === scope ? state.status : null;
  const isCurrent = () => mounted.current && currentScope.current === scope && getApiContextRevision() === scope.revision;
  const copyCoordinates = async () => {
    if (!value || !isCurrent() || inFlight.current === scope) return;
    inFlight.current = scope;
    setState({ scope, status: 'copying' });
    try {
      const copied = await copyToClipboard(value);
      if (isCurrent()) setState({ scope, status: copied ? 'ok' : 'err' });
    } catch {
      if (isCurrent()) setState({ scope, status: 'err' });
    } finally {
      if (inFlight.current === scope) inFlight.current = null;
    }
  };
  return (
    <View style={styles.container}>
      <AppButton
        label="Copy coordinates"
        variant="secondary"
        fullWidth
        style={styles.button}
        disabled={!value || status === 'copying'}
        loading={status === 'copying'}
        accessibilityLabel="Copy coordinates"
        accessibilityHint={value ? 'Copies the saved booking latitude and longitude.' : 'No valid coordinates are available to copy.'}
        onPress={() => { void copyCoordinates(); }}
      />
      {!value ? <Text style={styles.hint}>No valid coordinates available to copy.</Text> : null}
      {status === 'ok' || status === 'err' ? (
        <View accessibilityLiveRegion="polite">
          <StatusBanner kind={status} message={status === 'ok' ? 'Coordinates copied.' : 'Could not copy coordinates. Please try again.'} />
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
