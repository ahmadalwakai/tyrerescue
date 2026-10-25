import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { requestJson } from './api';
import { resetBookingQuote } from './booking-safety';
import { colors, typography } from './theme';
import type { BookingState } from './types';
import { InlineNotice, OptionCard, PrimaryButton } from './ui';

interface Workshop { address: string; lat: number; lng: number }

export function CustomerFittingChoice({ state, updateState }: {
  state: BookingState;
  updateState: (updates: Partial<BookingState>) => void;
}) {
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadTick, setLoadTick] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    setLoading(true);
    setError('');
    void requestJson<{ workshop: Workshop }>('/api/bookings/config', { signal: controller.signal }).then((result) => {
      const value = result.workshop;
      if (!value || typeof value.address !== 'string' || !value.address.trim() || !Number.isFinite(value.lat) || !Number.isFinite(value.lng) ||
          Math.abs(value.lat) > 90 || Math.abs(value.lng) > 180) throw new Error('Workshop details are unavailable. Please try again.');
      if (active) setWorkshop(value);
    }).catch(() => { if (active) setError('Unable to load workshop details. Please try again or choose a mobile fitting.'); })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [loadTick]);

  function chooseShop() {
    if (!workshop || loading) return;
    if (state.fittingLocation === 'shop' && state.address === workshop.address && state.lat === workshop.lat && state.lng === workshop.lng) return;
    updateState({ ...resetBookingQuote, fittingLocation: 'shop', address: workshop.address, lat: workshop.lat, lng: workshop.lng,
      distanceMiles: 0, scheduledDate: null, scheduledTime: null, slotId: null, emergencyEtaLabel: null, nearestDriverName: null });
  }

  function chooseMobile() {
    if (state.fittingLocation === 'mobile') return;
    updateState({ ...resetBookingQuote, fittingLocation: 'mobile', scheduledDate: null, scheduledTime: null, slotId: null,
      ...(state.fittingLocation === 'shop' ? { address: '', lat: null, lng: null, distanceMiles: null, emergencyEtaLabel: null, nearestDriverName: null } : {}) });
  }

  return <View style={styles.content}>
    <Text style={styles.title}>Where would you like your fitting?</Text>
    <Text style={styles.detail}>Visit our workshop, or choose a mobile fitting at home or work.</Text>
    <OptionCard title="At the workshop" detail={workshop?.address || (loading ? 'Loading workshop address…' : 'Workshop details unavailable')} meta="No callout fee" metaTone="success"
      icon="home" selected={state.fittingLocation === 'shop'} disabled={loading || !workshop} onPress={chooseShop} />
    <OptionCard title="Come to my location" detail="Tell us where you need us. Any travel fee appears in your quote." meta="Mobile fitting" metaTone="accent"
      icon="map-pin" selected={state.fittingLocation === 'mobile'} onPress={chooseMobile} />
    {loading ? <ActivityIndicator accessibilityLabel="Loading workshop address" color={colors.accent} /> : null}
    {error ? <><InlineNotice tone="danger">{error}</InlineNotice><PrimaryButton icon="refresh-cw" variant="secondary" onPress={() => setLoadTick((value) => value + 1)}>Retry workshop details</PrimaryButton></> : null}
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  title: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 19 },
  detail: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
});
