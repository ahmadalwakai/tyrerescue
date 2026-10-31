import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { withDeadline } from './booking-safety';
import { validateCustomerAddress, type CustomerAddressInput } from './customer-addresses';
import { prepareCustomerLocation } from './customer-location';
import { liveLocationMarkers, reverseGeocode, searchAddress, type MapCoordinate } from './mapbox';
import { PulsingMap } from './pulsing-map';
import { colors, typography } from './theme';
import { Card, Chip, InlineNotice, PrimaryButton, Row, TextField } from './ui';

type Place = Pick<CustomerAddressInput, 'addressLine' | 'lat' | 'lng'>;
export function CustomerAddressEditor({ initial, busy, onSave, onCancel }: {
  initial?: CustomerAddressInput;
  busy: boolean;
  onSave: (input: CustomerAddressInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? 'Home');
  const [query, setQuery] = useState(initial?.addressLine ?? '');
  const [place, setPlace] = useState<Place | null>(initial ?? null);
  const [suggestions, setSuggestions] = useState<Awaited<ReturnType<typeof searchAddress>>>([]);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveLock = useRef(false);
  const disabled = busy || saving;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); };
  }, []);

  function invalidate() {
    if (timer.current) clearTimeout(timer.current);
    return ++generation.current;
  }

  function changeQuery(value: string) {
    if (disabled) return;
    const revision = invalidate();
    setQuery(value); setPlace(null); setSuggestions([]); setError(''); setLocating(false);
    if (value.trim().length < 3) return;
    timer.current = setTimeout(() => {
      setLocating(true);
      void withDeadline(searchAddress(value), 15_000, 'Address search timed out. Please try again.').then(matches => {
        if (!mounted.current || generation.current !== revision) return;
        setSuggestions(matches);
        if (!matches.length) setError('No addresses found. Try a full postcode or use your current location.');
      }).catch(reason => {
        if (mounted.current && generation.current === revision) setError(reason instanceof Error ? reason.message : 'Unable to search addresses.');
      }).finally(() => { if (mounted.current && generation.current === revision) setLocating(false); });
    }, 300);
  }

  function select(next: Place) {
    invalidate();
    setPlace(next); setQuery(next.addressLine); setSuggestions([]); setError(''); setLocating(false);
  }

  async function movePin(coordinate: MapCoordinate) {
    if (disabled) return;
    const revision = invalidate();
    setLocating(true); setPlace(null); setError(''); setSuggestions([]);
    try {
      const [lng, lat] = coordinate;
      const addressLine = await withDeadline(reverseGeocode(lat, lng), 15_000, 'Unable to find the address. Try searching for it.');
      if (mounted.current && generation.current === revision) select({ lat, lng, addressLine });
    } catch (reason) { if (mounted.current && generation.current === revision) setError(reason instanceof Error ? reason.message : 'Unable to move the pin.'); }
    finally { if (mounted.current && generation.current === revision) setLocating(false); }
  }

  async function locate() {
    if (disabled || locating) return;
    const revision = invalidate();
    setLocating(true); setPlace(null); setError(''); setSuggestions([]);
    try {
      const result = await prepareCustomerLocation({ requestPermission: true, force: true });
      if (!mounted.current || generation.current !== revision) return;
      if (result.status !== 'ready' || !result.place) throw new Error(result.message || 'Search for the address instead.');
      select({ lat: result.place.lat, lng: result.place.lng, addressLine: result.place.address });
    } catch (reason) { if (mounted.current && generation.current === revision) setError(reason instanceof Error ? reason.message : 'Unable to find your location.'); }
    finally { if (mounted.current && generation.current === revision) setLocating(false); }
  }

  async function save() {
    if (!place || disabled || locating || saveLock.current) return;
    const input = { ...place, label: label.trim(), addressLine: place.addressLine.trim() };
    const validation = validateCustomerAddress(input);
    if (validation) { setError(validation); return; }
    saveLock.current = true; setSaving(true); setError('');
    try { await onSave(input); }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Unable to save this address. Please try again.'); }
    finally { saveLock.current = false; if (mounted.current) setSaving(false); }
  }

  return <Card>
    <Text style={styles.title} accessibilityRole="header">{initial ? 'Edit saved address' : 'Add a saved address'}</Text>
    <View style={styles.chips}>
      {['Home', 'Work'].map(value => <Chip key={value} label={value} selected={label === value} onPress={() => { if (!disabled) setLabel(value); }} />)}
    </View>
    <TextField label="Address name" placeholder="Home, Work or another name" value={label} onChangeText={setLabel} maxLength={40} editable={!disabled} />
    <TextField label="Address or postcode" value={query} onChangeText={changeQuery} placeholder="Search for your address" maxLength={500} editable={!disabled} />
    {suggestions.map(match => <PrimaryButton key={match.id} variant="secondary" disabled={disabled}
      onPress={() => select({ addressLine: match.place_name, lat: match.center[1], lng: match.center[0] })}>{match.place_name}</PrimaryButton>)}
    <PrimaryButton icon="navigation" variant="secondary" disabled={disabled || locating} onPress={() => void locate()}>Use current location</PrimaryButton>
    {locating ? <Text accessibilityLiveRegion="polite" style={styles.detail}>Finding the address…</Text> : null}
    {place ? <>
      <PulsingMap centerCoordinate={[place.lng, place.lat]} markers={liveLocationMarkers(place.lat, place.lng)}
        onCoordinateSelected={coordinate => { void movePin(coordinate); }} style={styles.map} />
      <Row label="Selected address" value={place.addressLine} />
      <Text style={styles.detail}>Check the address and map pin. Service availability is checked when you book.</Text>
    </> : <Text style={styles.detail}>Choose a search result to confirm the address and map pin.</Text>}
    {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
    <PrimaryButton icon="check" loading={saving} disabled={busy || locating || !place || !label.trim()} onPress={() => void save()}>Save address</PrimaryButton>
    <PrimaryButton variant="ghost" disabled={disabled} onPress={onCancel}>Cancel</PrimaryButton>
  </Card>;
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontFamily: typography.heading, fontSize: 18 },
  detail: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  map: { height: 190, borderRadius: 12 },
});
