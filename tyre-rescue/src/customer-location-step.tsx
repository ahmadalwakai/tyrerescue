import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { API, requestJson } from './api';
import { resetBookingQuote, withDeadline } from './booking-safety';
import { prepareCustomerLocation } from './customer-location';
import { liveLocationMarkers, reverseGeocode, searchAddress, type MapCoordinate } from './mapbox';
import { PulsingMap } from './pulsing-map';
import { colors } from './theme';
import type { BookingState } from './types';
import { Card, InlineNotice, LoadingState, PrimaryButton, Row, ScreenHeader, TextField } from './ui';

interface Validation { valid: boolean; distanceMiles: number; message: string }
interface Place { lat: number; lng: number; address: string }
export function CustomerLocationStep({ state, updateState, goNext }: { state: BookingState; updateState: (value: Partial<BookingState>) => void; goNext: () => void }) {
  const [address, setAddress] = useState(state.address);
  const [selected, setSelected] = useState<Place | null>(state.lat !== null && state.lng !== null ? { lat: state.lat, lng: state.lng, address: state.address } : null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [suggestions, setSuggestions] = useState<Awaited<ReturnType<typeof searchAddress>>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [settingsNeeded, setSettingsNeeded] = useState(false);
  const [editing, setEditing] = useState(Platform.OS === 'web' || Boolean(state.address && (state.lat === null || state.lng === null)));
  const generation = useRef(0);
  const mounted = useRef(true);
  const confirmed = useRef(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = useRef(state);

  const applyPlace = useCallback(async (place: Place, revision: number) => {
    const current = () => mounted.current && generation.current === revision;
    if (!current()) return;
    setSelected(place); setAddress(place.address); setSuggestions([]); setValidation(null); setBusy(true); setError(null);
    try {
      const result = await withDeadline(requestJson<Validation>(API.validateLocation, { method: 'POST', body: JSON.stringify({ lat: place.lat, lng: place.lng, address: place.address }) }), 20000, 'Checking the service area took too long. Please try again.');
      if (!current()) return;
      setValidation(result);
      if (!result.valid) setError(result.message);
    } catch (err) { if (current()) { setValidation(null); setError(err instanceof Error ? err.message : 'Unable to check this location.'); } }
    finally { if (current()) setBusy(false); }
  }, []);

  const chooseCoordinate = useCallback(async (coordinate: MapCoordinate) => {
    const revision = ++generation.current;
    setBusy(true); setValidation(null); setError(null); setAccuracy(null);
    try {
      const [lng, lat] = coordinate;
      const nextAddress = await withDeadline(reverseGeocode(lat, lng), 15000, 'Could not find an address here. Enter the address manually.');
      await applyPlace({ lat, lng, address: nextAddress }, revision);
    } catch (err) { if (mounted.current && revision === generation.current) { setError(err instanceof Error ? err.message : 'Unable to select this location.'); setBusy(false); } }
  }, [applyPlace]);

  const locate = useCallback(async (explicit = true) => {
    const revision = ++generation.current;
    const current = () => mounted.current && revision === generation.current;
    setBusy(true); setError(null); setSelected(null); setValidation(null); setAccuracy(null); setSettingsNeeded(false);
    try {
      const result = await prepareCustomerLocation({ requestPermission: explicit, force: explicit });
      if (!current()) return;
      setSettingsNeeded(result.settingsNeeded);
      if (result.status !== 'ready' || !result.place) {
        throw new Error(result.message || 'Unable to find your location. Please enter the address manually.');
      }
      setAccuracy(result.place.accuracy);
      setEditing(false);
      await applyPlace(result.place, revision);
    } catch (err) { if (current()) { setValidation(null); setEditing(true); setError(err instanceof Error ? err.message : 'Unable to get your location.'); } }
    finally { if (current()) setBusy(false); }
  }, [applyPlace]);

  useEffect(() => {
    mounted.current = true;
    const saved = initial.current;
    if (saved.lat !== null && saved.lng !== null) void applyPlace({ lat: saved.lat, lng: saved.lng, address: saved.address }, ++generation.current);
    else if (!saved.address && Platform.OS !== 'web') void locate(false);
    return () => { mounted.current = false; if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [applyPlace, locate]);

  function changeAddress(value: string) {
    const revision = ++generation.current;
    setAddress(value); setSelected(null); setValidation(null); setAccuracy(null); setBusy(false); setError(null); setSuggestions([]);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim().length < 3) return;
    searchTimer.current = setTimeout(() => {
      void searchAddress(value).then(matches => { if (mounted.current && generation.current === revision) setSuggestions(matches); }).catch(() => { if (mounted.current && generation.current === revision) setError('Address search is unavailable. Please try again.'); });
    }, 280);
  }

  function editAddress() {
    ++generation.current;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    confirmed.current = false;
    setEditing(true); setSelected(null); setValidation(null); setAccuracy(null); setBusy(false); setError(null); setSuggestions([]);
  }

  function confirmLocation() {
    if (confirmed.current || !selected || !validation?.valid || busy) return;
    confirmed.current = true;
    updateState({ ...resetBookingQuote, address: selected.address, lat: selected.lat, lng: selected.lng, distanceMiles: validation.distanceMiles });
    goNext();
  }

  return <View style={styles.content}>
    <ScreenHeader eyebrow="Location" title={selected ? 'Is this where you need us?' : busy ? 'Finding your location' : 'Where do you need us?'} detail="Check that the address and pin are at your vehicle, then confirm with one tap." />
    {editing ? <>
      <TextField label="Address or postcode" value={address} onChangeText={changeAddress} placeholder="Enter your address or postcode" />
      {suggestions.map(place => <Pressable accessibilityRole="button" accessibilityLabel={place.place_name} key={place.id} style={styles.suggestion} onPress={() => { setAccuracy(null); void applyPlace({ lat: place.center[1], lng: place.center[0], address: place.place_name }, ++generation.current); }}><Text style={styles.text}>{place.place_name}</Text></Pressable>)}
    </> : null}
    {selected ? <Card>
      <Row label="Address / map pin" value={selected.address} />
      {accuracy !== null ? <Row label="GPS accuracy" value={`Approximately ${Math.ceil(accuracy)} metres`} /> : null}
      <PrimaryButton icon="check" disabled={!validation?.valid || busy} onPress={confirmLocation}>Yes, use this location</PrimaryButton>
      <PrimaryButton variant="ghost" onPress={editAddress}>Change address</PrimaryButton>
      <PulsingMap centerCoordinate={[selected.lng, selected.lat]} markers={liveLocationMarkers(selected.lat, selected.lng)} onCoordinateSelected={coordinate => { void chooseCoordinate(coordinate); }} style={styles.map} />
      <Text style={styles.hint}>Tap the map to move the pin to your vehicle.</Text>
    </Card> : null}
    {busy ? <LoadingState label="Checking your location..." /> : null}
    {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
    {!selected && !editing ? <PrimaryButton variant="secondary" onPress={editAddress}>Enter address manually</PrimaryButton> : null}
    <PrimaryButton icon="navigation" variant="secondary" loading={busy} onPress={() => { void locate(); }}>Use current location</PrimaryButton>
    {settingsNeeded && Platform.OS !== 'web' ? <PrimaryButton variant="secondary" onPress={() => { void Linking.openSettings(); }}>Open location settings</PrimaryButton> : null}
  </View>;
}
const styles = StyleSheet.create({ content: { gap: 16 }, suggestion: { padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, text: { color: colors.text }, hint: { color: colors.muted, marginTop: 8 }, map: { height: 230, marginTop: 12 } });
