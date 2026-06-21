import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { API, customerInvoiceUrl, endpoint, requestJson } from './api';
import { addToCart, cartItemCount, updateCartQuantity } from './booking-helpers';
import { BUSINESS_NAME, MAPBOX_TOKEN, PHONE_DISPLAY, PHONE_TEL } from './config';
import { useCustomerAccount } from './customer-account';
import { registerForCustomerPushNotificationsAsync } from './customer-notifications';
import { CustomerPaymentControl } from './customer-payment-control';
import {
  fallbackRouteCoordinates,
  getDrivingRouteCoordinates,
  liveLocationMarkers,
  reverseGeocode,
  routeLiveMapMarkers,
  searchAddress,
  type MapCoordinate,
} from './mapbox';
import { PulsingMap } from './pulsing-map';
import { colors, radii, spacing, typography } from './theme';
import {
  Card,
  EmptyBox,
  InlineNotice,
  LoadingState,
  Logo,
  OptionCard,
  Pill,
  PrimaryButton,
  Row,
  ScreenHeader,
  Section,
  TextField,
} from './ui';
import {
  clampQuantity,
  formatPrice,
  getSteps,
  initialBookingState,
  tyreSizeDisplay,
  type BookingState,
  type ConditionAssessment,
  type FittingLocation,
  type MapboxFeature,
  type PricingBreakdown,
  type SelectedTyre,
  type TimeSlot,
  type TyreProduct,
  type WizardStep,
} from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(\+44|0)[0-9\s]{9,14}$/;
const WIZARD_ORDER: WizardStep[] = [
  'service',
  'location',
  'eligibility',
  'details',
  'tyres',
  'schedule',
  'quote',
  'customer',
  'payment',
  'done',
];

type UpdateState = (updates: Partial<BookingState>) => void;

interface StepProps {
  state: BookingState;
  updateState: UpdateState;
  goNext: () => void;
  goPrev: () => void;
  goTo: (step: WizardStep) => void;
}

function toLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseSize(size: string) {
  const match = size.match(/^(\d+)\/(\d+)\/R(\d+)$/i);
  if (!match) return null;
  return { width: match[1], aspect: match[2], rim: match[3] };
}

function currentStepLabel(step: WizardStep) {
  const labels: Record<WizardStep, string> = {
    service: 'Service',
    location: 'Location',
    eligibility: 'Availability',
    details: 'Tyres',
    tyres: 'Choose',
    schedule: 'Schedule',
    quote: 'Quote',
    customer: 'Details',
    payment: 'Payment',
    done: 'Done',
  };
  return labels[step];
}

function StepProgress({ state, step }: { state: BookingState; step: WizardStep }) {
  if (step === 'service' || step === 'done') return null;
  const steps = getSteps(state.bookingType, state.serviceType);
  const index = getProgressIndex(steps, step);
  const progress = steps.length <= 1 ? 0 : (index / (steps.length - 1)) * 100;

  return (
    <Card style={screenStyles.progressCard}>
      <View style={screenStyles.progressTrack}>
        <View style={[screenStyles.progressFill, { width: `${progress}%` }]} />
      </View>
      <View style={screenStyles.progressRow}>
        <Text style={screenStyles.progressText}>
          {index + 1} / {steps.length}
        </Text>
        <Text style={screenStyles.progressText}>{currentStepLabel(step)}</Text>
      </View>
    </Card>
  );
}

export function BookingScreen() {
  const [state, setState] = useState<BookingState>(initialBookingState);
  const [step, setStep] = useState<WizardStep>('service');

  const updateState = useCallback((updates: Partial<BookingState>) => {
    setState((current) => ({ ...current, ...updates }));
  }, []);

  const goTo = useCallback((nextStep: WizardStep) => setStep(nextStep), []);

  const goNext = useCallback(() => {
    const steps = getSteps(state.bookingType, state.serviceType);
    const nextStep = getAdjacentStep(steps, step, 1);
    if (nextStep) setStep(nextStep);
  }, [state.bookingType, state.serviceType, step]);

  const goPrev = useCallback(() => {
    const steps = getSteps(state.bookingType, state.serviceType);
    const previousStep = getAdjacentStep(steps, step, -1);
    if (previousStep) setStep(previousStep);
  }, [state.bookingType, state.serviceType, step]);

  const reset = useCallback(() => {
    setState(initialBookingState);
    setStep('service');
  }, []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={screenStyles.root}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={screenStyles.content}
      >
        <View style={screenStyles.topBar}>
          <Logo />
          {step !== 'service' && step !== 'done' ? (
            <Pressable accessibilityRole="button" onPress={goPrev} style={screenStyles.backButton}>
              <Feather name="chevron-left" size={18} color={colors.text} />
            </Pressable>
          ) : null}
        </View>

        <StepProgress state={state} step={step} />

        {step === 'service' ? (
          <ServiceStep state={state} updateState={updateState} goNext={goNext} goPrev={goPrev} goTo={goTo} />
        ) : null}
        {step === 'location' ? (
          <LocationStep state={state} updateState={updateState} goNext={goNext} goPrev={goPrev} goTo={goTo} />
        ) : null}
        {step === 'eligibility' ? (
          <EligibilityStep state={state} updateState={updateState} goNext={goNext} goPrev={goPrev} goTo={goTo} />
        ) : null}
        {step === 'details' ? (
          <DetailsStep state={state} updateState={updateState} goNext={goNext} goPrev={goPrev} goTo={goTo} />
        ) : null}
        {step === 'tyres' ? (
          <TyresStep state={state} updateState={updateState} goNext={goNext} goPrev={goPrev} goTo={goTo} />
        ) : null}
        {step === 'schedule' ? (
          <ScheduleStep state={state} updateState={updateState} goNext={goNext} goPrev={goPrev} goTo={goTo} />
        ) : null}
        {step === 'quote' ? (
          <QuoteStep state={state} updateState={updateState} goNext={goNext} goPrev={goPrev} goTo={goTo} />
        ) : null}
        {step === 'customer' ? (
          <CustomerStep state={state} updateState={updateState} goNext={goNext} goPrev={goPrev} goTo={goTo} />
        ) : null}
        {step === 'payment' ? (
          <PaymentStep state={state} updateState={updateState} goNext={goNext} goPrev={goPrev} goTo={goTo} />
        ) : null}
        {step === 'done' ? <DoneStep state={state} reset={reset} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function getProgressIndex(steps: WizardStep[], step: WizardStep) {
  const index = steps.indexOf(step);
  if (index >= 0) return index;

  const orderIndex = WIZARD_ORDER.indexOf(step);
  if (orderIndex < 0) return 0;

  const previousValidStep = WIZARD_ORDER.slice(0, orderIndex + 1)
    .reverse()
    .find((candidate) => steps.includes(candidate));

  return previousValidStep ? steps.indexOf(previousValidStep) : 0;
}

function getAdjacentStep(steps: WizardStep[], step: WizardStep, direction: 1 | -1) {
  const index = steps.indexOf(step);
  if (index >= 0) return steps[index + direction] ?? null;

  const orderIndex = WIZARD_ORDER.indexOf(step);
  if (orderIndex < 0) return null;

  const candidates =
    direction > 0
      ? WIZARD_ORDER.slice(orderIndex + 1)
      : WIZARD_ORDER.slice(0, orderIndex).reverse();

  return candidates.find((candidate) => steps.includes(candidate)) ?? null;
}

function ServiceStep({ state, updateState, goNext }: StepProps) {
  const [availability, setAvailability] = useState<{ available: boolean; count: number } | null>(null);

  useEffect(() => {
    requestJson<{ available: boolean; count: number }>(API.driverAvailable)
      .then(setAvailability)
      .catch(() => setAvailability({ available: false, count: 0 }));
  }, []);

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader
        eyebrow="Start your booking"
        title="Choose how soon you need us"
        detail="Emergency dispatch and scheduled fitting use the same live pricing, stock, and availability rules as the website."
      />

      <OptionCard
        icon="zap"
        meta={availability?.available ? 'Available now' : availability ? 'Call to check' : 'Checking'}
        selected={state.bookingType === 'emergency'}
        title="Emergency Callout"
        detail="Driver-led callout to your confirmed location."
        onPress={() =>
          updateState({
            ...quoteReset,
            bookingType: 'emergency',
            fittingLocation: null,
            scheduledDate: null,
            scheduledTime: null,
          })
        }
      />
      <OptionCard
        icon="calendar"
        meta="Book a slot"
        selected={state.bookingType === 'scheduled'}
        title="Schedule a Fitting"
        detail="Choose the shop or mobile fitting, then pick a date and time."
        onPress={() =>
          updateState({
            ...quoteReset,
            bookingType: 'scheduled',
            fittingLocation: state.fittingLocation ?? null,
          })
        }
      />

      <PrimaryButton icon="arrow-right" disabled={!state.bookingType} onPress={goNext}>
        Continue
      </PrimaryButton>
      <PrimaryButton
        icon="phone"
        variant="secondary"
        onPress={() => Linking.openURL(`tel:${PHONE_TEL}`)}
      >
        {PHONE_DISPLAY}
      </PrimaryButton>
    </View>
  );
}

interface LocationValidation {
  valid: boolean;
  distanceMiles: number;
  estimatedMinutes?: number;
  message: string;
}

function LocationStep({ state, updateState, goNext }: StepProps) {
  const [address, setAddress] = useState(state.address);
  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [selected, setSelected] = useState(
    state.lat && state.lng ? { lat: state.lat, lng: state.lng, address: state.address } : null,
  );
  const [validation, setValidation] = useState<LocationValidation | null>(
    state.distanceMiles != null ? { valid: true, distanceMiles: state.distanceMiles, message: '' } : null,
  );
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mapMarkers = selected ? liveLocationMarkers(selected.lat, selected.lng) : [];

  const validate = useCallback(async (lat: number, lng: number, nextAddress: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await requestJson<LocationValidation>(API.validateLocation, {
        method: 'POST',
        body: JSON.stringify({ lat, lng, address: nextAddress }),
      });
      setValidation(data);
      if (!data.valid) setError(data.message);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to validate this location.';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const chooseFeature = async (feature: MapboxFeature) => {
    const [lng, lat] = feature.center;
    const next = { lat, lng, address: feature.place_name };
    setAddress(next.address);
    setSelected(next);
    setSuggestions([]);
    await validate(lat, lng, next.address);
  };

  const handleAddressChange = (value: string) => {
    setAddress(value);
    setSelected(null);
    setValidation(null);
    setError(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const matches = await searchAddress(value).catch(() => []);
      setSuggestions(matches);
    }, 280);
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Location permission was not granted.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const nextAddress = await reverseGeocode(lat, lng);
      setAddress(nextAddress);
      setSelected({ lat, lng, address: nextAddress });
      setSuggestions([]);
      await validate(lat, lng, nextAddress);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to get your location.');
    } finally {
      setLocating(false);
    }
  };

  const canContinue = selected && validation?.valid;

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader
        eyebrow="Location"
        title="Where are you?"
        detail="Use your current location or choose an address from Mapbox suggestions."
      />

      {!MAPBOX_TOKEN ? (
        <InlineNotice tone="danger">Mapbox token is missing for this build.</InlineNotice>
      ) : null}

      <PrimaryButton icon="navigation" variant="secondary" loading={locating} onPress={useCurrentLocation}>
        Use current location
      </PrimaryButton>

      <View>
        <TextField
          label="Address or postcode"
          value={address}
          onChangeText={handleAddressChange}
          placeholder="G31 1PD"
        />
        {suggestions.length > 0 ? (
          <View style={screenStyles.suggestions}>
            {suggestions.map((item) => (
              <Pressable key={item.id} style={screenStyles.suggestionItem} onPress={() => chooseFeature(item)}>
                <Text style={screenStyles.suggestionMain}>{item.place_name.split(', ')[0]}</Text>
                <Text style={screenStyles.suggestionSub}>{item.place_name.split(', ').slice(1).join(', ')}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {selected ? (
        <Card>
          <Row label="Selected" value={selected.address} />
          {selected ? (
            <PulsingMap
              centerCoordinate={[selected.lng, selected.lat]}
              markers={mapMarkers}
              style={screenStyles.mapImage}
            />
          ) : null}
          {loading ? <LoadingState label="Checking service area..." /> : null}
        </Card>
      ) : null}

      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}

      <PrimaryButton
        icon="arrow-right"
        disabled={!canContinue || loading}
        onPress={() => {
          if (!selected || !validation?.valid) return;
          updateState({
            ...quoteReset,
            address: selected.address,
            lat: selected.lat,
            lng: selected.lng,
            distanceMiles: validation.distanceMiles,
          });
          goNext();
        }}
      >
        Continue
      </PrimaryButton>
    </View>
  );
}

interface EligibilityResult {
  eligible: boolean;
  etaLabel: string;
  distanceMiles: number;
  driverName: string | null;
  driverLat: number | null;
  driverLng: number | null;
  driversOnline: number;
  message: string;
}

function EligibilityStep({ state, updateState, goNext, goPrev }: StepProps) {
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<MapCoordinate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (state.lat == null || state.lng == null) return;
    setLoading(true);
    setError(null);
    setRouteCoordinates(null);
    try {
      const data = await requestJson<EligibilityResult>(API.eligibility, {
        method: 'POST',
        body: JSON.stringify({ lat: state.lat, lng: state.lng }),
      });
      setResult(data);
      void getDrivingRouteCoordinates({
        customerLat: state.lat,
        customerLng: state.lng,
        driverLat: data.driverLat,
        driverLng: data.driverLng,
      })
        .then(setRouteCoordinates)
        .catch(() => setRouteCoordinates(null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to check availability.');
    } finally {
      setLoading(false);
    }
  }, [state.lat, state.lng]);

  useEffect(() => {
    check();
  }, [check]);

  if (loading) return <LoadingState label="Checking emergency availability..." />;

  if (error) {
    return (
      <View style={screenStyles.stepGap}>
        <InlineNotice tone="danger">{error}</InlineNotice>
        <PrimaryButton icon="refresh-cw" onPress={check}>Retry</PrimaryButton>
        <PrimaryButton variant="secondary" icon="arrow-left" onPress={goPrev}>Back</PrimaryButton>
      </View>
    );
  }

  if (!result?.eligible) {
    return (
      <View style={screenStyles.stepGap}>
        <ScreenHeader eyebrow="Availability" title="Outside service area" detail={result?.message} />
        <PrimaryButton icon="map-pin" onPress={goPrev}>Change location</PrimaryButton>
        <PrimaryButton icon="phone" variant="secondary" onPress={() => Linking.openURL(`tel:${PHONE_TEL}`)}>
          {PHONE_DISPLAY}
        </PrimaryButton>
      </View>
    );
  }

  const routeMarkers =
    state.lat != null && state.lng != null
      ? routeLiveMapMarkers({
          customerLat: state.lat,
          customerLng: state.lng,
          driverLat: result.driverLat,
          driverLng: result.driverLng,
        })
      : [];
  const routeLineCoordinates =
    state.lat != null && state.lng != null
      ? routeCoordinates ??
        fallbackRouteCoordinates({
          customerLat: state.lat,
          customerLng: state.lng,
          driverLat: result.driverLat,
          driverLng: result.driverLng,
        })
      : [];

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader eyebrow="Availability" title="Driver available" detail={result.message} />
      {state.lat != null && state.lng != null ? (
        <PulsingMap
          markers={routeMarkers}
          routeCoordinates={routeLineCoordinates}
          style={screenStyles.mapImageTall}
        />
      ) : null}
      <Card style={screenStyles.etaCard}>
        <Text style={screenStyles.etaText}>{result.etaLabel || '1-2 hours'}</Text>
        <Text style={screenStyles.etaLabel}>Estimated arrival</Text>
        {result.driverName ? <Text style={screenStyles.mutedCentered}>Nearest driver: {result.driverName}</Text> : null}
        <Text style={screenStyles.mutedCentered}>{result.driversOnline} driver{result.driversOnline === 1 ? '' : 's'} online</Text>
      </Card>
      <PrimaryButton icon="arrow-right" onPress={() => {
        updateState({
          emergencyEtaLabel: result.etaLabel,
          nearestDriverName: result.driverName,
        });
        goNext();
      }}>
        Continue
      </PrimaryButton>
    </View>
  );
}

interface SizeSuggestion {
  size: string;
  count: number;
}

function DetailsStep({ state, updateState, goNext }: StepProps) {
  const [vehicleReg, setVehicleReg] = useState(state.vehicleReg);
  const [vehicleMake, setVehicleMake] = useState(state.vehicleMake);
  const [vehicleModel, setVehicleModel] = useState(state.vehicleModel);
  const [width, setWidth] = useState(state.tyreSize.width);
  const [aspect, setAspect] = useState(state.tyreSize.aspect);
  const [rim, setRim] = useState(state.tyreSize.rim);
  const [condition, setCondition] = useState<ConditionAssessment | null>(state.conditionAssessment);
  const [quantity, setQuantity] = useState(clampQuantity(state.quantity));
  const [lockingNut, setLockingNut] = useState(state.lockingNutStatus);
  const [photoUrl, setPhotoUrl] = useState<string | null>(state.tyrePhotoUrl);
  const [sizeQuery, setSizeQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SizeSuggestion[]>([]);
  const [popular, setPopular] = useState<SizeSuggestion[]>([]);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    requestJson<SizeSuggestion[]>(API.popularTyreSizes)
      .then((data) => setPopular(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const lookupVehicle = async () => {
    const reg = vehicleReg.replace(/\s+/g, '').toUpperCase();
    if (reg.length < 2) return;
    setLoadingLookup(true);
    setError(null);
    try {
      const data = await requestJson<{ make?: string; model?: string }>(`${API.vehicleLookup}?reg=${encodeURIComponent(reg)}`);
      if (data.make) setVehicleMake(data.make);
      if (data.model) setVehicleModel(data.model);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vehicle lookup failed.');
    } finally {
      setLoadingLookup(false);
    }
  };

  const chooseSize = (size: string) => {
    const parsed = parseSize(size);
    if (!parsed) return;
    setWidth(parsed.width);
    setAspect(parsed.aspect);
    setRim(parsed.rim);
    setSizeQuery('');
    setSuggestions([]);
  };

  const searchSizes = (value: string) => {
    setSizeQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const data = await requestJson<{ sizes: SizeSuggestion[] }>(`${API.tyreSizes}?q=${encodeURIComponent(value.trim())}`).catch(() => ({ sizes: [] }));
      setSuggestions(data.sizes || []);
    }, 300);
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setError('Photo library permission was not granted.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.78,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const form = new FormData();
    form.append('file', {
      uri: asset.uri,
      name: asset.fileName || 'tyre-photo.jpg',
      type: asset.mimeType || 'image/jpeg',
    } as unknown as Blob);

    setUploading(true);
    setError(null);
    try {
      const res = await fetch(endpoint(API.uploadTyrePhoto), {
        method: 'POST',
        body: form,
        headers: { Accept: 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Photo upload failed.');
      setPhotoUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const canContinue = width.length >= 3 && aspect.length >= 2 && rim.length >= 2 && condition;
  const showQuantity = condition === 'repair' || state.bookingType === 'emergency';

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader eyebrow="Tyre details" title="Tell us about the tyre" detail="Vehicle lookup and tyre size search use the live website data." />

      <Section title="Vehicle">
        <View style={screenStyles.inlineFields}>
          <View style={screenStyles.flex}>
            <TextField label="Registration" value={vehicleReg} onChangeText={(v) => setVehicleReg(v.toUpperCase())} placeholder="AB12 CDE" autoCapitalize="characters" />
          </View>
          <PrimaryButton icon="search" variant="secondary" loading={loadingLookup} style={screenStyles.lookupButton} onPress={lookupVehicle}>
            Lookup
          </PrimaryButton>
        </View>
        <TextField label="Make" value={vehicleMake} onChangeText={setVehicleMake} placeholder="Ford" />
        <TextField label="Model" value={vehicleModel} onChangeText={setVehicleModel} placeholder="Focus" />
      </Section>

      <Section title="Tyre size">
        <TextField label="Search size" value={sizeQuery} onChangeText={searchSizes} placeholder="205/55/R16" />
        {suggestions.length > 0 ? (
          <View style={screenStyles.suggestions}>
            {suggestions.map((item) => (
              <Pressable key={item.size} style={screenStyles.suggestionItem} onPress={() => chooseSize(item.size)}>
                <Text style={screenStyles.suggestionMain}>{item.size}</Text>
                <Text style={screenStyles.suggestionSub}>{item.count} available</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={screenStyles.sizeRow}>
          <TextField label="Width" value={width} onChangeText={(v) => setWidth(v.replace(/\D/g, '').slice(0, 3))} placeholder="205" keyboardType="number-pad" style={screenStyles.sizeField} inputStyle={screenStyles.centerInput} />
          <TextField label="Aspect" value={aspect} onChangeText={(v) => setAspect(v.replace(/\D/g, '').slice(0, 2))} placeholder="55" keyboardType="number-pad" style={screenStyles.sizeField} inputStyle={screenStyles.centerInput} />
          <TextField label="Rim" value={rim} onChangeText={(v) => setRim(v.replace(/\D/g, '').slice(0, 2))} placeholder="16" keyboardType="number-pad" style={screenStyles.sizeField} inputStyle={screenStyles.centerInput} />
        </View>
        <Card style={screenStyles.sizePreview}>
          <Text style={screenStyles.sizePreviewText}>{tyreSizeDisplay({ width, aspect, rim }) || 'Enter tyre size'}</Text>
        </Card>
        {popular.length > 0 ? (
          <View style={screenStyles.chipWrap}>
            {popular.slice(0, 8).map((item) => (
              <Pressable key={item.size} style={screenStyles.chip} onPress={() => chooseSize(item.size)}>
                <Text style={screenStyles.chipText}>{item.size}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Section>

      <Section title="Service">
        <OptionCard title="Puncture repair" detail="Small puncture, slow leak, or nail in tyre." selected={condition === 'repair'} icon="tool" onPress={() => setCondition('repair')} />
        <OptionCard title="Tyre replacement" detail="Damaged sidewall, blowout, or worn tread." selected={condition === 'replacement'} icon="disc" onPress={() => setCondition('replacement')} />
        <OptionCard title="Not sure" detail="Driver assesses and advises on arrival." selected={condition === 'not_sure'} icon="help-circle" onPress={() => setCondition('not_sure')} />
      </Section>

      {showQuantity ? (
        <Section title="Quantity">
          <View style={screenStyles.quantityRow}>
            {[1, 2, 3, 4].map((item) => (
              <Pressable
                key={item}
                style={[screenStyles.quantityButton, quantity === item ? screenStyles.quantityButtonSelected : null]}
                onPress={() => setQuantity(item)}
              >
                <Text style={[screenStyles.quantityText, quantity === item ? screenStyles.quantityTextSelected : null]}>{item}</Text>
              </Pressable>
            ))}
          </View>
        </Section>
      ) : null}

      <Section title="Locking wheel nuts">
        <View style={screenStyles.threeGrid}>
          {[
            ['standard', 'Standard nuts'],
            ['has_key', 'I have the key'],
            ['no_key', 'No key'],
          ].map(([value, label]) => (
            <Pressable
              key={value}
              style={[screenStyles.smallOption, lockingNut === value ? screenStyles.smallOptionSelected : null]}
              onPress={() => setLockingNut(value as BookingState['lockingNutStatus'])}
            >
              <Text style={screenStyles.smallOptionText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <Section title="Photo">
        {photoUrl ? <Image source={{ uri: photoUrl }} style={screenStyles.photoPreview} /> : null}
        <PrimaryButton icon="image" variant="secondary" loading={uploading} onPress={pickPhoto}>
          {photoUrl ? 'Replace photo' : 'Add tyre photo'}
        </PrimaryButton>
      </Section>

      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}

      <PrimaryButton
        icon="arrow-right"
        disabled={!canContinue}
        onPress={() => {
          if (!condition) return;
          const nextServiceType = condition === 'repair' ? 'repair' : condition === 'replacement' ? 'fit' : 'assess';
          const shouldClearTyres =
            condition === 'repair' ||
            state.tyreSize.width !== width ||
            state.tyreSize.aspect !== aspect ||
            state.tyreSize.rim !== rim ||
            state.quantity !== quantity;
          updateState({
            ...quoteReset,
            vehicleReg,
            vehicleMake,
            vehicleModel,
            tyreSize: { width, aspect, rim },
            conditionAssessment: condition,
            serviceType: nextServiceType,
            quantity: clampQuantity(quantity),
            lockingNutStatus: lockingNut,
            tyrePhotoUrl: photoUrl,
            selectedTyres: shouldClearTyres ? [] : state.selectedTyres,
            fulfillmentOption: shouldClearTyres ? null : state.fulfillmentOption,
          });
          goNext();
        }}
      >
        Continue
      </PrimaryButton>
    </View>
  );
}

function TyresStep({ state, updateState, goNext }: StepProps) {
  const [tyres, setTyres] = useState<TyreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderPrompt, setOrderPrompt] = useState<TyreProduct | null>(null);

  const size = state.tyreSize;
  const totalItems = cartItemCount(state.selectedTyres);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await requestJson<{ tyres: TyreProduct[] }>(
          `${API.tyres}?width=${size.width}&aspect=${size.aspect}&rim=${size.rim}&limit=30`,
        );
        if (mounted) setTyres(data.tyres || []);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load tyres.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [size.aspect, size.rim, size.width]);

  const setCart = (cart: SelectedTyre[]) => {
    updateState({ ...quoteReset, selectedTyres: cart });
  };

  const addTyre = (tyre: TyreProduct, fulfillment?: 'delivery' | 'fitting') => {
    if (!tyre.priceNew) return;
    const inStock = tyre.availableNew && tyre.stockNew >= 1;
    const service = state.conditionAssessment === 'not_sure' ? 'assess' : 'fit';
    setCart(
      addToCart(state.selectedTyres, {
        tyreId: tyre.id,
        brand: tyre.brand,
        pattern: tyre.pattern,
        sizeDisplay: tyre.sizeDisplay,
        unitPrice: tyre.priceNew,
        service,
        isPreOrder: tyre.isOrderOnly || !inStock,
        orderConfirmed: Boolean(fulfillment),
      }),
    );
    if (fulfillment) updateState({ fulfillmentOption: fulfillment });
    setOrderPrompt(null);
  };

  if (loading) return <LoadingState label="Loading matching tyres..." />;

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader eyebrow="Tyres" title="Choose your tyres" detail={`Size ${tyreSizeDisplay(state.tyreSize)}. Select up to 4 tyres.`} />
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {!error && tyres.length === 0 ? (
        <EmptyBox>No tyres are listed for this size right now. Call us and we can source one.</EmptyBox>
      ) : null}

      {tyres.map((tyre) => {
        const item = state.selectedTyres.find((cartItem) => cartItem.tyreId === tyre.id);
        const inStock = tyre.availableNew && tyre.stockNew >= 1;
        const canAdd = totalItems < 4 && tyre.priceNew != null;
        return (
          <Card key={tyre.id} style={item ? screenStyles.selectedTyreCard : null}>
            <View style={screenStyles.tyreTop}>
              <View style={screenStyles.flex}>
                <Text style={screenStyles.tyreBrand}>{tyre.brand}</Text>
                <Text style={screenStyles.tyrePattern}>{tyre.pattern}</Text>
                <Text style={screenStyles.tyreSize}>{tyre.sizeDisplay}</Text>
              </View>
              <View style={screenStyles.priceStack}>
                <Text style={screenStyles.tyrePrice}>{formatPrice(tyre.priceNew)}</Text>
                <Pill tone={tyre.isOrderOnly ? 'accent' : inStock ? 'success' : 'neutral'}>
                  {tyre.isOrderOnly ? 'Special order' : inStock ? 'In stock' : 'Pre-order'}
                </Pill>
              </View>
            </View>
            <View style={screenStyles.tyreMetaRow}>
              <Text style={screenStyles.tyreMeta}>{tyre.tier}</Text>
              <Text style={screenStyles.tyreMeta}>{tyre.season}</Text>
              {tyre.wetGrip ? <Text style={screenStyles.tyreMeta}>Grip {tyre.wetGrip}</Text> : null}
            </View>
            {item ? (
              <View style={screenStyles.cartControls}>
                <PrimaryButton variant="secondary" icon="minus" style={screenStyles.qtyControl} onPress={() => setCart(updateCartQuantity(state.selectedTyres, tyre.id, item.quantity - 1))}>
                  Less
                </PrimaryButton>
                <Text style={screenStyles.cartQty}>{item.quantity}</Text>
                <PrimaryButton variant="secondary" icon="plus" style={screenStyles.qtyControl} onPress={() => setCart(updateCartQuantity(state.selectedTyres, tyre.id, item.quantity + 1))}>
                  More
                </PrimaryButton>
              </View>
            ) : (
              <PrimaryButton
                icon="shopping-cart"
                variant="secondary"
                disabled={!canAdd}
                onPress={() => (tyre.isOrderOnly ? setOrderPrompt(tyre) : addTyre(tyre))}
              >
                Add to booking
              </PrimaryButton>
            )}
          </Card>
        );
      })}

      {state.selectedTyres.length > 0 ? (
        <Card>
          <Row label="Selected" value={`${totalItems} tyre${totalItems === 1 ? '' : 's'}`} />
          <Row label="Tyres subtotal" value={formatPrice(state.selectedTyres.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0))} valueStyle={{ color: colors.accent }} />
        </Card>
      ) : null}

      <PrimaryButton icon="arrow-right" disabled={state.selectedTyres.length === 0} onPress={goNext}>
        Continue
      </PrimaryButton>

      <Modal transparent visible={Boolean(orderPrompt)} animationType="fade" onRequestClose={() => setOrderPrompt(null)}>
        <View style={screenStyles.modalBackdrop}>
          <Card style={screenStyles.modalCard}>
            <ScreenHeader eyebrow="Special order" title="Choose fulfilment" detail={orderPrompt ? `${orderPrompt.brand} ${orderPrompt.pattern} is usually 2-3 working days.` : undefined} />
            <PrimaryButton icon="truck" onPress={() => orderPrompt && addTyre(orderPrompt, 'delivery')}>Delivery only</PrimaryButton>
            <PrimaryButton icon="tool" variant="secondary" onPress={() => orderPrompt && addTyre(orderPrompt, 'fitting')}>Fitting after arrival</PrimaryButton>
            <PrimaryButton icon="x" variant="ghost" onPress={() => setOrderPrompt(null)}>Cancel</PrimaryButton>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

function ScheduleStep({ state, updateState, goNext }: StepProps) {
  const [fittingLocation, setFittingLocation] = useState<FittingLocation | null>(state.fittingLocation);
  const [selectedDate, setSelectedDate] = useState(state.scheduledDate || toLocalIsoDate(new Date()));
  const [selectedTime, setSelectedTime] = useState(state.scheduledTime || '');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dates = useMemo(() => {
    return Array.from({ length: 15 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() + index);
      return {
        value: toLocalIsoDate(date),
        day: date.toLocaleDateString('en-GB', { weekday: 'short' }),
        label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      };
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadSlots() {
      setLoading(true);
      setError(null);
      try {
        const data = await requestJson<{ slots: TimeSlot[] }>(
          `${API.availabilitySlots}?date=${selectedDate}&lat=${state.lat}&lng=${state.lng}`,
        );
        if (mounted) setSlots(data.slots || []);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load slots.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadSlots();
    return () => {
      mounted = false;
    };
  }, [selectedDate, state.lat, state.lng]);

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader eyebrow="Schedule" title="Choose date and time" detail="Pick fitting at the shop or at your location." />

      <Section title="Fitting location">
        <View style={screenStyles.twoGrid}>
          <OptionCard title="At the shop" detail="No extra fee." meta="Shop" icon="home" selected={fittingLocation === 'shop'} onPress={() => setFittingLocation('shop')} />
          <OptionCard title="At your location" detail="Priced in quote." meta="Mobile" icon="map-pin" selected={fittingLocation === 'mobile'} onPress={() => setFittingLocation('mobile')} />
        </View>
      </Section>

      <Section title="Date">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={screenStyles.dateRow}>
          {dates.map((date) => (
            <Pressable
              key={date.value}
              style={[screenStyles.dateButton, selectedDate === date.value ? screenStyles.dateButtonSelected : null]}
              onPress={() => {
                setSelectedDate(date.value);
                setSelectedTime('');
              }}
            >
              <Text style={screenStyles.dateDay}>{date.day}</Text>
              <Text style={screenStyles.dateLabel}>{date.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Section>

      <Section title="Time">
        {loading ? <LoadingState label="Loading available times..." /> : null}
        {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
        {!loading && !error && slots.length === 0 ? <EmptyBox>No slots available on this date.</EmptyBox> : null}
        <View style={screenStyles.slotGrid}>
          {slots.map((slot) => (
            <Pressable
              key={slot.slotId}
              disabled={!slot.available}
              style={[
                screenStyles.slotButton,
                selectedTime === slot.time ? screenStyles.slotButtonSelected : null,
                !slot.available ? screenStyles.disabledBlock : null,
              ]}
              onPress={() => setSelectedTime(slot.time)}
            >
              <Text style={screenStyles.slotTime}>{slot.label}</Text>
              <Text style={screenStyles.slotMeta}>{slot.spotsLeft <= 3 ? `${slot.spotsLeft} left` : 'Available'}</Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <PrimaryButton
        icon="arrow-right"
        disabled={!fittingLocation || !selectedDate || !selectedTime}
        onPress={() => {
          updateState({
            ...quoteReset,
            fittingLocation,
            scheduledDate: selectedDate,
            scheduledTime: selectedTime,
          });
          goNext();
        }}
      >
        Continue
      </PrimaryButton>
    </View>
  );
}

async function findCheapestMatchingTyre(state: BookingState): Promise<SelectedTyre | null> {
  const { width, aspect, rim } = state.tyreSize;
  if (!width || !aspect || !rim) return null;
  const data = await requestJson<{ tyres: TyreProduct[] }>(
    `${API.tyres}?width=${width}&aspect=${aspect}&rim=${rim}&limit=20`,
  );
  const priced = (data.tyres || []).filter((tyre) => tyre.priceNew != null && tyre.priceNew > 0);
  const withStock = priced.filter((tyre) => (tyre.stockNew || 0) >= state.quantity);
  const candidates = (withStock.length ? withStock : priced).sort((a, b) => Number(a.priceNew) - Number(b.priceNew));
  const tyre = candidates[0];
  if (!tyre || !tyre.priceNew) return null;
  return {
    tyreId: tyre.id,
    brand: tyre.brand,
    pattern: tyre.pattern,
    sizeDisplay: tyre.sizeDisplay,
    quantity: state.quantity || 1,
    unitPrice: tyre.priceNew,
    service: state.serviceType === 'assess' ? 'assess' : 'fit',
    isPreOrder: false,
  };
}

function QuoteStep({ state, updateState, goNext, goTo }: StepProps) {
  const [loading, setLoading] = useState(!state.breakdown);
  const [error, setError] = useState<string | null>(null);

  const requestQuote = useCallback(async () => {
    if (state.lat == null || state.lng == null || !state.bookingType) return;
    setLoading(true);
    setError(null);
    try {
      const isRepair = state.serviceType === 'repair' || state.conditionAssessment === 'repair';
      const isEmergencyWithoutTyres = state.bookingType === 'emergency' && state.selectedTyres.length === 0 && !isRepair;
      const autoTyre = isEmergencyWithoutTyres ? await findCheapestMatchingTyre(state) : null;
      const sendAsRepair = isRepair || (isEmergencyWithoutTyres && !autoTyre);
      const selections = autoTyre ? [autoTyre] : sendAsRepair ? [] : state.selectedTyres;
      const serviceType = autoTyre ? autoTyre.service : sendAsRepair ? 'repair' : state.serviceType || 'fit';
      const scheduledAt =
        state.scheduledDate && state.scheduledTime
          ? new Date(`${state.scheduledDate}T${state.scheduledTime}`).toISOString()
          : undefined;

      const data = await requestJson<{
        quoteId: string;
        expiresAt: string;
        breakdown: PricingBreakdown;
      }>(API.quote, {
        method: 'POST',
        headers: { 'x-visit-count': '1' },
        body: JSON.stringify({
          lat: state.lat,
          lng: state.lng,
          addressLine: state.address,
          bookingType: state.bookingType,
          serviceType,
          quantity: sendAsRepair ? state.quantity || 1 : undefined,
          fittingLocation: state.fittingLocation ?? undefined,
          fulfillmentOption: state.fulfillmentOption ?? undefined,
          scheduledAt,
          tyreSelections: selections.map((item) => ({
            tyreId: item.tyreId,
            quantity: item.quantity,
            service: item.service,
            requiresTpms: item.requiresTpms ?? false,
            isPreOrder: item.isPreOrder ?? false,
          })),
        }),
      });

      updateState({
        quoteId: data.quoteId,
        quoteExpiresAt: data.expiresAt,
        breakdown: data.breakdown,
        selectedTyres: autoTyre ? [autoTyre] : sendAsRepair ? [] : state.selectedTyres,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get quote.';
      if (message.toLowerCase().includes('slot')) goTo('schedule');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [goTo, state, updateState]);

  useEffect(() => {
    if (!state.breakdown || !state.quoteId) requestQuote();
  }, [requestQuote, state.breakdown, state.quoteId]);

  if (loading && !state.breakdown) return <LoadingState label="Calculating live quote..." />;

  const total = state.breakdown?.total ?? 0;

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader eyebrow="Quote" title="Your price" detail="This quote comes from the same pricing engine used on the website." />
      {error ? (
        <>
          <InlineNotice tone="danger">{error}</InlineNotice>
          <PrimaryButton icon="refresh-cw" onPress={requestQuote}>Retry</PrimaryButton>
        </>
      ) : null}
      {state.breakdown ? (
        <>
          <Card>
            <Row label="Service" value={state.serviceType === 'repair' ? 'Puncture repair' : state.serviceType === 'assess' ? 'Assessment' : 'Tyre fitting'} />
            <Row label="Location" value={state.address} />
            {state.scheduledDate && state.scheduledTime ? <Row label="Appointment" value={`${state.scheduledDate} ${state.scheduledTime}`} /> : null}
            {state.selectedTyres.map((tyre) => (
              <Row key={tyre.tyreId} label={`${tyre.quantity}x ${tyre.brand}`} value={tyre.sizeDisplay} />
            ))}
          </Card>
          <Card style={screenStyles.totalCard}>
            <Text style={screenStyles.totalLabel}>Total</Text>
            <Text style={screenStyles.totalPrice}>{formatPrice(total)}</Text>
          </Card>
          <PrimaryButton icon="arrow-right" disabled={total <= 0} onPress={goNext}>
            Continue to details
          </PrimaryButton>
          <PrimaryButton icon="refresh-cw" variant="secondary" loading={loading} onPress={requestQuote}>
            Refresh quote
          </PrimaryButton>
        </>
      ) : null}
    </View>
  );
}

function CustomerStep({ state, updateState, goNext, goTo }: StepProps) {
  const { profile } = useCustomerAccount();
  const [name, setName] = useState(state.customerName || profile?.name || '');
  const [email, setEmail] = useState(state.customerEmail || profile?.email || '');
  const [phone, setPhone] = useState(state.customerPhone || profile?.phone || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    if (!state.customerName && !name) setName(profile.name);
    if (!state.customerEmail && !email) setEmail(profile.email);
    if (!state.customerPhone && !phone && profile.phone) setPhone(profile.phone);
  }, [email, name, phone, profile, state.customerEmail, state.customerName, state.customerPhone]);

  const submit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    if (!name.trim()) return setError('Full name is required.');
    if (!EMAIL_RE.test(trimmedEmail)) return setError('Enter a valid email address.');
    if (!PHONE_RE.test(trimmedPhone.replace(/\s/g, ''))) return setError('Enter a valid UK phone number.');
    if (!state.quoteId) return setError('Quote is missing. Please refresh the quote.');

    setLoading(true);
    setError(null);
    try {
      const data = await requestJson<{
        bookingId: string;
        refNumber: string;
        stripeClientSecret: string;
      }>(API.createBooking, {
        method: 'POST',
        body: JSON.stringify({
          quoteId: state.quoteId,
          customerName: name.trim(),
          customerEmail: trimmedEmail,
          customerPhone: trimmedPhone,
          vehicleReg: state.vehicleReg || undefined,
          vehicleMake: state.vehicleMake || undefined,
          vehicleModel: state.vehicleModel || undefined,
          tyreSizeDisplay: tyreSizeDisplay(state.tyreSize) || undefined,
          tyrePhotoUrl: state.tyrePhotoUrl || undefined,
          lockingNutStatus: state.lockingNutStatus,
          fulfillmentOption: state.fulfillmentOption ?? undefined,
          landing_page: 'ios-app',
          referrer: 'ios-app',
        }),
      });
      updateState({
        customerName: name.trim(),
        customerEmail: trimmedEmail,
        customerPhone: trimmedPhone,
        bookingId: data.bookingId,
        refNumber: data.refNumber,
        stripeClientSecret: data.stripeClientSecret,
      });
      goNext();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create booking.';
      if (message.toLowerCase().includes('slot')) goTo('schedule');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader eyebrow="Your details" title="Contact details" detail="We use these details for the booking confirmation and driver contact." />
      {state.breakdown ? (
        <Card>
          <Row label="Total" value={formatPrice(state.breakdown.total)} valueStyle={{ color: colors.accent }} />
        </Card>
      ) : null}
      <TextField label="Full name" value={name} onChangeText={setName} placeholder="John Smith" autoComplete="name" />
      <TextField label="Email" value={email} onChangeText={setEmail} placeholder="john@example.com" keyboardType="email-address" autoComplete="email" />
      <TextField label="Phone" value={phone} onChangeText={setPhone} placeholder="07123 456789" keyboardType="phone-pad" autoComplete="tel" />
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      <PrimaryButton icon="credit-card" loading={loading} onPress={submit}>
        Continue to payment
      </PrimaryButton>
    </View>
  );
}

function PaymentStep({ state, updateState, goTo }: StepProps) {
  const handlePaid = useCallback(
    async (paymentIntentId: string) => {
      if (!state.refNumber) throw new Error('Booking reference is missing.');
      const confirmation = await requestJson<{
        status: string;
        invoiceDownloadToken?: string;
      }>(API.confirmBooking, {
        method: 'POST',
        body: JSON.stringify({
          bookingId: state.refNumber,
          paymentIntentId,
        }),
      }).catch(() => null);
      if (confirmation?.invoiceDownloadToken) {
        updateState({ invoiceDownloadToken: confirmation.invoiceDownloadToken });
      }
      goTo('done');
    },
    [goTo, state.refNumber, updateState],
  );

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader eyebrow="Payment" title="Secure payment" detail="Card payment is handled by Stripe." />
      <Card>
        <Row label="Reference" value={state.refNumber || '-'} />
        <Row label="Total" value={formatPrice(state.breakdown?.total)} valueStyle={{ color: colors.accent }} />
      </Card>
      {state.stripeClientSecret && state.refNumber ? (
        <CustomerPaymentControl
          amountLabel={formatPrice(state.breakdown?.total)}
          clientSecret={state.stripeClientSecret}
          onPaid={handlePaid}
          refNumber={state.refNumber}
        />
      ) : (
        <InlineNotice tone="danger">Missing payment information. Please go back and try again.</InlineNotice>
      )}
    </View>
  );
}

function DoneStep({ state, reset }: { state: BookingState; reset: () => void }) {
  useEffect(() => {
    if (!state.refNumber || !state.customerEmail) return;
    void registerForCustomerPushNotificationsAsync({
      refNumber: state.refNumber,
      email: state.customerEmail,
    });
  }, [state.customerEmail, state.refNumber]);

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader eyebrow="Confirmed" title="Booking received" detail={`${BUSINESS_NAME} has your booking reference.`} />
      <Card style={screenStyles.doneCard}>
        <Feather name="check-circle" size={44} color={colors.success} />
        <Text style={screenStyles.doneRef}>{state.refNumber}</Text>
        <Text style={screenStyles.mutedCentered}>Confirmation email and SMS will be sent after payment confirmation.</Text>
      </Card>
      {state.refNumber && state.invoiceDownloadToken ? (
        <PrimaryButton
          icon="download"
          variant="secondary"
          onPress={() => Linking.openURL(customerInvoiceUrl(state.refNumber!, state.invoiceDownloadToken!))}
        >
          Download invoice
        </PrimaryButton>
      ) : null}
      <AccountOffer state={state} />
      <PrimaryButton icon="phone" variant="secondary" onPress={() => Linking.openURL(`tel:${PHONE_TEL}`)}>
        {PHONE_DISPLAY}
      </PrimaryButton>
      <PrimaryButton icon="plus" onPress={reset}>New booking</PrimaryButton>
    </View>
  );
}

function AccountOffer({ state }: { state: BookingState }) {
  const account = useCustomerAccount();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!state.refNumber || !state.customerEmail) return null;

  if (account.profile) {
    return (
      <Card style={screenStyles.accountCard}>
        <View style={screenStyles.accountHeading}>
          <Feather name="user-check" size={22} color={colors.success} />
          <Text style={screenStyles.accountTitle}>Account ready</Text>
        </View>
        <Row label="Signed in" value={account.profile.email} />
        <PrimaryButton icon="list" onPress={() => router.push('/account')}>
          View my bookings
        </PrimaryButton>
      </Card>
    );
  }

  async function createAccount() {
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const payload = await account.createAccountFromBooking({
        refNumber: state.refNumber!,
        name: state.customerName,
        email: state.customerEmail,
        phone: state.customerPhone,
        password,
      });
      setPassword('');
      setConfirmPassword('');
      setMessage(payload.message || 'Account created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={screenStyles.accountCard}>
      <View style={screenStyles.accountHeading}>
        <Feather name="user-plus" size={22} color={colors.accent} />
        <Text style={screenStyles.accountTitle}>Create account</Text>
      </View>
      <Row label="Booking" value={state.refNumber} />
      <Row label="Email" value={state.customerEmail} />
      <TextField label="Password" value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry autoComplete="password-new" />
      <TextField label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm password" secureTextEntry autoComplete="password-new" />
      {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      <PrimaryButton
        icon="user-plus"
        loading={busy}
        disabled={!password || !confirmPassword}
        onPress={createAccount}
      >
        Create account
      </PrimaryButton>
    </Card>
  );
}

const quoteReset = {
  quoteId: null,
  breakdown: null,
  quoteExpiresAt: null,
  bookingId: null,
  refNumber: null,
  stripeClientSecret: null,
  invoiceDownloadToken: null,
} satisfies Partial<BookingState>;

const screenStyles = StyleSheet.create({
  root: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  content: {
    gap: 18,
    padding: spacing.page,
    paddingBottom: 42,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 54,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  stepGap: {
    gap: 14,
  },
  progressCard: {
    gap: 10,
    padding: 12,
  },
  progressTrack: {
    backgroundColor: colors.border,
    borderRadius: 999,
    height: 3,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.accent,
    height: 3,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  suggestions: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  suggestionItem: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
    padding: 13,
  },
  suggestionMain: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
  },
  suggestionSub: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  mapImage: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    height: 178,
    marginTop: 12,
    width: '100%',
  },
  mapImageTall: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    height: 220,
    width: '100%',
  },
  etaCard: {
    alignItems: 'center',
    borderColor: colors.accent,
    borderWidth: 2,
  },
  etaText: {
    color: colors.accent,
    fontFamily: typography.display,
    fontSize: 52,
    lineHeight: 52,
  },
  etaLabel: {
    color: colors.muted,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  mutedCentered: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  inlineFields: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  lookupButton: {
    minWidth: 108,
  },
  sizeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sizeField: {
    flex: 1,
  },
  centerInput: {
    textAlign: 'center',
  },
  sizePreview: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  sizePreviewText: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 18,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipText: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  quantityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quantityButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  quantityButtonSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  quantityText: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 26,
  },
  quantityTextSelected: {
    color: colors.accent,
  },
  threeGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  twoGrid: {
    gap: 10,
  },
  smallOption: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    padding: 8,
  },
  smallOptionSelected: {
    borderColor: colors.accent,
  },
  smallOptionText: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    textAlign: 'center',
  },
  photoPreview: {
    borderRadius: radii.lg,
    height: 190,
    width: '100%',
  },
  tyreTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  selectedTyreCard: {
    borderColor: colors.accent,
  },
  tyreBrand: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 18,
  },
  tyrePattern: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  tyreSize: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 25,
    lineHeight: 28,
    marginTop: 4,
  },
  tyrePrice: {
    color: colors.accent,
    fontFamily: typography.bodyBold,
    fontSize: 18,
    textAlign: 'right',
  },
  priceStack: {
    alignItems: 'flex-end',
    gap: 7,
  },
  tyreMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  tyreMeta: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  cartControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 14,
  },
  qtyControl: {
    flex: 1,
  },
  cartQty: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 18,
    minWidth: 28,
    textAlign: 'center',
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    gap: 12,
    width: '100%',
  },
  dateRow: {
    gap: 8,
    paddingRight: 6,
  },
  dateButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    minHeight: 76,
    minWidth: 72,
    justifyContent: 'center',
    padding: 10,
  },
  dateButtonSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  dateDay: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  dateLabel: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    minHeight: 74,
    padding: 10,
    width: '31.8%',
  },
  slotButtonSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  disabledBlock: {
    opacity: 0.45,
  },
  slotTime: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 24,
    lineHeight: 28,
  },
  slotMeta: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 11,
  },
  totalCard: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  totalLabel: {
    color: colors.bg,
    fontFamily: typography.bodyBold,
    fontSize: 13,
  },
  totalPrice: {
    color: colors.bg,
    fontFamily: typography.display,
    fontSize: 50,
    lineHeight: 52,
  },
  doneCard: {
    alignItems: 'center',
    gap: 10,
  },
  doneRef: {
    color: colors.accent,
    fontFamily: typography.display,
    fontSize: 46,
    lineHeight: 48,
  },
  accountCard: {
    gap: 12,
  },
  accountHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  accountTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 17,
  },
});
