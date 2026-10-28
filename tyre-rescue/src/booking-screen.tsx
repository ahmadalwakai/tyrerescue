import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Animated, { FadeIn } from 'react-native-reanimated';

import { API, customerInvoiceUrl, fetchApi, requestJson } from './api';
import { addToCart, cartItemCount, updateCartQuantity } from './booking-helpers';
import { BOOKING_DRAFT_KEY, londonDate, londonDateChoices, londonScheduledAt, requireConfirmedBooking, resetBookingQuote, restoreBookingDraft, withDeadline } from './booking-safety';
import { bookingDraftSession, clearBookingDraft, saveBookingDraft } from './booking-draft-storage';
import { getSecureItem } from './secure-storage';
import { CustomerLocationStep as LocationStep } from './customer-location-step';
import { CustomerCallbackRequest } from './customer-callback';
import { CustomerAssistedHelpRequest } from './customer-assisted-help-request';
import { CustomerFittingChoice } from './customer-fitting-choice';
import { BookingContinueButton, BookingFooter, BookingFooterProvider } from './booking-footer';
import { useCustomerReducedMotion } from './use-customer-reduced-motion';
import { bookingAccessScope, saveBookingAccess } from './customer-booking-access';
import { BUSINESS_NAME, PHONE_DISPLAY, PHONE_TEL } from './config';
import { useCustomerAccount } from './customer-account';
import { CustomerActiveBookingCard } from './customer-active-booking';
import { customerPushScope, registerForCustomerPushNotificationsAsync } from './customer-notifications';
import { CustomerPaymentControl } from './customer-payment-control';
import { validateCustomerPaymentStatus, type CustomerPaymentStatus } from './customer-payment-recovery';
import {
  getDrivingRouteCoordinates,
  routeLiveMapMarkers,
  type MapCoordinate,
} from './mapbox';
import { PulsingMap } from './pulsing-map';
import { colors, radii, spacing, typography } from './theme';
import {
  ActionTile,
  AppHeader,
  Card,
  Chip,
  Disclosure,
  EmptyBox,
  InlineNotice,
  LoadingState,
  OptionCard,
  Pill,
  PrimaryButton,
  QuantityStepper,
  Row,
  ScreenHeader,
  Section,
  Segmented,
  SummaryItem,
  TextField,
  useScreenContentInsets,
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
  type PricingBreakdown,
  type ProblemType,
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

function LockingNutPriceNotice({ status }: { status: BookingState['lockingNutStatus'] }) {
  if (status !== 'no_key') return null;
  return <InlineNotice>The team must confirm any locking wheel nut removal charge with you first. The amount shown for payment covers only the listed services. Any additional removal fee needs your agreement before it is charged.</InlineNotice>;
}

interface StepProps {
  state: BookingState;
  updateState: UpdateState;
  goNext: () => void;
  goPrev: () => void;
  goTo: (step: WizardStep) => void;
  setNavigationLocked?: (locked: boolean) => void;
}

function ServiceHeroHeader() {
  return <View style={screenStyles.heroHeader}>
    <Text accessibilityRole="header" style={screenStyles.heroTitle}>How can we help?</Text>
    <Text style={screenStyles.heroDetail}>Roadside help now, or a fitting when it suits you.</Text>
  </View>;
}

/** Appointment dates are stored as London calendar days (YYYY-MM-DD) plus a HH:mm slot. */
function formatAppointment(date: string | null, time: string | null) {
  if (!date) return time || '';
  const parsed = new Date(`${date}T12:00:00Z`);
  const day = Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return time ? `${day} at ${time}` : day;
}

function parseSize(size: string) {
  const match = size.match(/^(\d{3})\s*\/\s*(\d{2})\s*\/?\s*R?(\d{2})$/i);
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
    quote: 'Review',
    customer: 'Details',
    payment: 'Payment',
    done: 'Done',
  };
  return labels[step];
}

const BOOKING_STAGES = [
  { title: 'Request details', steps: ['service', 'location', 'eligibility'] },
  { title: 'Choose service', steps: ['details', 'tyres', 'schedule'] },
  { title: 'Confirm & pay', steps: ['quote', 'customer', 'payment', 'done'] },
] as const;

function StepProgress({ state, step }: { state: BookingState; step: WizardStep }) {
  if (step === 'service' || step === 'done') return null;
  const activeStage = BOOKING_STAGES.findIndex(stage => (stage.steps as readonly string[]).includes(step));
  const steps = getSteps(state.bookingType, state.serviceType, state.fittingLocation);
  // The service choice is already made on the home screen, so count only the steps after it.
  const total = Math.max(1, steps.length - 1);
  const position = Math.min(total, Math.max(1, getProgressIndex(steps, step)));
  const stage = BOOKING_STAGES[Math.max(0, activeStage)];
  return <View accessible accessibilityRole="progressbar"
    accessibilityLabel={`Stage ${activeStage + 1} of 3, ${stage.title}, current. ${currentStepLabel(step)}, step ${position} of ${total}`}
    accessibilityValue={{ min: 0, max: total, now: position }}
    style={screenStyles.progress}>
    <View style={screenStyles.progressTrack}>
      <View style={[screenStyles.progressFill, { width: `${Math.round((position / total) * 100)}%` }]} />
    </View>
    <Text style={screenStyles.progressLabel}>{currentStepLabel(step)} · {position} of {total}</Text>
  </View>;
}

function renderLocationConfirmAction(props: ComponentProps<typeof PrimaryButton>) {
  return <BookingContinueButton {...props} />;
}

export function BookingScreen() {
  const account = useCustomerAccount();
  if (account.loading) return <LoadingState label="Loading your booking..." />;
  return <CustomerBookingSession key={account.sessionRevision} />;
}

function CustomerBookingSession() {
  const account = useCustomerAccount();
  const reducedMotion = useCustomerReducedMotion();
  const [state, setState] = useState<BookingState>(initialBookingState);
  const [step, setStep] = useState<WizardStep>('service');
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [navigationLocked, setNavigationLocked] = useState(false);
  const params = useLocalSearchParams<{ repeatRef?: string; vehicleReg?: string; vehicleMake?: string; vehicleModel?: string; tyreSizeDisplay?: string; tyreQuantity?: string; serviceType?: string }>();
  const prefillKey = JSON.stringify(params);
  const scrollRef = useRef<ScrollView>(null);
  const [draftSession] = useState(bookingDraftSession);
  useEffect(() => {
    let current = true;
    void getSecureItem(BOOKING_DRAFT_KEY).then(raw => {
      if (!current) return;
      const draft = restoreBookingDraft(raw);
      if (draft) { setState(draft.state); setStep(draft.step); setDraftRestored(true); }
    }).catch(() => {}).finally(() => { if (current) setDraftReady(true); });
    return () => { current = false; };
  }, []);
  useEffect(() => {
    if (!draftReady || !params.repeatRef) return;
    if (state.pendingPaymentIntentId || state.paymentAttemptIntentId) return;
    const booking = account.bookings.find(item => item.refNumber === params.repeatRef);
    if (!account.profile || !booking) return;
    const size = booking.tyreSizeDisplay ? parseSize(booking.tyreSizeDisplay) : null;
    setState({ ...initialBookingState,
      vehicleReg: booking.vehicleReg?.slice(0,20) || '',
      vehicleMake: booking.vehicleMake?.slice(0,80) || '',
      vehicleModel: booking.vehicleModel?.slice(0,80) || '',
      tyreSize: size || initialBookingState.tyreSize,
      quantity: clampQuantity(booking.tyreQuantity || 1),
    });
    router.setParams({ repeatRef: undefined, vehicleReg: undefined, vehicleMake: undefined, vehicleModel: undefined, tyreSizeDisplay: undefined, tyreQuantity: undefined, serviceType: undefined });
    setStep('service'); setDraftRestored(false);
  // Route values are captured by the stable serialized route key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady, prefillKey]);
  useEffect(() => {
    if (!draftReady) return;
    const hasDraft = state.address || state.vehicleReg || state.customerName || state.pendingPaymentIntentId;
    void (step === 'done' || !hasDraft ? clearBookingDraft() : saveBookingDraft(state, step, draftSession)).catch(() => {});
  }, [draftReady, state, step, draftSession]);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  const safeContentInsets = useScreenContentInsets();

  const updateState = useCallback((updates: Partial<BookingState>) => {
    setState((current) => ({ ...current, ...updates }));
  }, []);

  const goTo = useCallback((nextStep: WizardStep) => {
    if ((state.pendingPaymentIntentId || state.paymentAttemptIntentId) && nextStep !== 'done' && nextStep !== 'payment') return;
    setStep((current) => {
      if (current !== nextStep) void Haptics.selectionAsync().catch(() => {});
      return nextStep;
    });
  }, [state.pendingPaymentIntentId, state.paymentAttemptIntentId]);

  const goNext = useCallback(() => {
    if (state.pendingPaymentIntentId || state.paymentAttemptIntentId) return;
    const steps = getSteps(state.bookingType, state.serviceType, state.fittingLocation);
    const nextStep = getAdjacentStep(steps, step, 1);
    if (nextStep) {
      void Haptics.selectionAsync().catch(() => {});
      setStep(nextStep);
    }
  }, [state.bookingType, state.serviceType, state.fittingLocation, state.pendingPaymentIntentId, state.paymentAttemptIntentId, step]);

  const goPrev = useCallback(() => {
    if (navigationLocked || state.pendingPaymentIntentId || state.paymentAttemptIntentId) return;
    const steps = getSteps(state.bookingType, state.serviceType, state.fittingLocation);
    const previousStep = getAdjacentStep(steps, step, -1);
    if (previousStep) {
      void Haptics.selectionAsync().catch(() => {});
      setStep(previousStep);
    }
  }, [state.bookingType, state.serviceType, state.fittingLocation, state.pendingPaymentIntentId, state.paymentAttemptIntentId, step, navigationLocked]);

  const reset = useCallback(() => {
    if (state.pendingPaymentIntentId || state.paymentAttemptIntentId) return;
    setState(initialBookingState);
    setStep('service');
    setDraftRestored(false);
    void clearBookingDraft().catch(() => {});
  }, [state.pendingPaymentIntentId, state.paymentAttemptIntentId]);

  if (!draftReady) return <LoadingState label="Restoring your booking..." />;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={screenStyles.root}
    >
      <BookingFooterProvider step={step}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={screenStyles.scroll}
        contentContainerStyle={[screenStyles.content, safeContentInsets]}
      >
        <View style={screenStyles.topBlock}>
          <AppHeader
            onBack={step !== 'service' && step !== 'done' && !state.pendingPaymentIntentId && !state.paymentAttemptIntentId ? goPrev : undefined}
            backDisabled={navigationLocked}
            backLabel="Previous booking step"
          />
          <StepProgress state={state} step={step} />
        </View>

        {draftRestored ? <InlineNotice tone="accent">We restored your saved details. Prices and times will be checked again.</InlineNotice> : null}

        <Animated.View key={step} entering={reducedMotion ? undefined : FadeIn.duration(160)} style={screenStyles.stepMotion}>
          {step === 'service' ? (
            <ServiceStep state={state} updateState={updateState} goNext={goNext} goPrev={goPrev} goTo={goTo} />
          ) : null}
          {step === 'location' ? (
            <LocationStep state={state} updateState={updateState} goNext={goNext} renderConfirmAction={renderLocationConfirmAction} />
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
            <QuoteStep state={state} updateState={updateState} goNext={goNext} goPrev={goPrev} goTo={goTo} setNavigationLocked={setNavigationLocked} />
          ) : null}
          {step === 'customer' ? (
            <CustomerStep state={state} updateState={updateState} goNext={goNext} goPrev={goPrev} goTo={goTo} setNavigationLocked={setNavigationLocked} />
          ) : null}
          {step === 'payment' ? (
            <PaymentStep state={state} updateState={updateState} goNext={goNext} goPrev={goPrev} goTo={goTo} setNavigationLocked={setNavigationLocked} />
          ) : null}
          {step === 'done' ? <DoneStep state={state} reset={reset} /> : null}
        </Animated.View>
      </ScrollView>
      <BookingFooter step={step} />
      </BookingFooterProvider>
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

function requiresNewQuote(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes('quote') &&
    (lower.includes('already been used') ||
      lower.includes('expired') ||
      lower.includes('create a new quote') ||
      lower.includes('request a new quote') ||
      lower.includes('not found'))
  );
}

function ServiceChoice({ icon, title, detail, meta, selected, emergency, onPress }: {
  icon: ComponentProps<typeof Feather>['name']; title: string; detail: string; meta: string;
  selected: boolean; emergency?: boolean; onPress: () => void;
}) {
  const iconColor = emergency ? colors.onAccent : colors.accent;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail} ${meta}`} accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [screenStyles.serviceChoice, emergency ? screenStyles.emergencyChoice : null,
      selected && !emergency ? screenStyles.serviceChoiceSelected : null, pressed ? screenStyles.choicePressed : null]}>
    <View style={screenStyles.serviceChoiceHeading}>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[screenStyles.serviceChoiceIcon, emergency ? screenStyles.emergencyChoiceIcon : null]}><Feather accessible={false} name={icon} size={22} color={iconColor} /></View>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Feather accessible={false} name={selected && !emergency ? 'check-circle' : 'arrow-right'} size={22} color={iconColor} /></View>
    </View>
    <View style={screenStyles.serviceChoiceCopy}>
      <Text style={[screenStyles.serviceChoiceTitle, emergency ? screenStyles.emergencyChoiceText : null]}>{title}</Text>
      <Text style={[screenStyles.serviceChoiceDetail, emergency ? screenStyles.emergencyChoiceText : null]}>{detail}</Text>
    </View>
    <View style={[screenStyles.serviceChoiceMetaRow, emergency ? screenStyles.emergencyMetaRow : null]}>
      {emergency ? <View style={screenStyles.liveDot} /> : null}
      <Text style={[screenStyles.serviceChoiceMeta, emergency ? screenStyles.emergencyChoiceText : null]}>{meta}</Text>
    </View>
  </Pressable>;
}

function ServiceStep({ state, updateState, goNext, goTo }: StepProps) {
  const [availability, setAvailability] = useState<{ available: boolean; count: number } | null>(null);
  const [callbackOpen, setCallbackOpen] = useState(false);
  useEffect(() => {
    requestJson<{ available: boolean; count: number }>(API.driverAvailable)
      .then(setAvailability)
      .catch(() => setAvailability({ available: false, count: 0 }));
  }, []);
  const driversMeta = availability?.available
    ? availability.count > 1 ? `${availability.count} drivers available now` : 'Drivers available now'
    : availability ? 'Call to check availability' : 'Checking driver availability';
  return <View style={screenStyles.stepGap}>
    <CustomerActiveBookingCard />
    <ServiceHeroHeader />
    {/* Emergency starts straight away: one tap takes the customer to their location. */}
    <ServiceChoice icon="zap" emergency title="Emergency tyre help" detail="Flat tyre or a puncture right now? We come to you."
      meta={driversMeta}
      selected={state.bookingType === 'emergency'} onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        updateState({ ...quoteReset, bookingType: 'emergency',
          ...(state.fittingLocation === 'shop' ? { address: '', lat: null, lng: null, distanceMiles: null } : {}),
          fittingLocation: null, scheduledDate: null, scheduledTime: null });
        goTo('location');
      }} />
    <ServiceChoice icon="calendar" title="Book a fitting" detail="At our workshop or at your home or work."
      meta="Pick a date and time" selected={state.bookingType === 'scheduled'} onPress={() => {
        if (state.bookingType === 'scheduled') return;
        void Haptics.selectionAsync().catch(() => {});
        updateState({ ...quoteReset, bookingType: 'scheduled', fittingLocation: state.fittingLocation ?? null });
      }} />
    {state.bookingType === 'scheduled' ? <>
      <CustomerFittingChoice state={state} updateState={updateState} />
      <BookingContinueButton icon="arrow-right" disabled={!state.fittingLocation} onPress={goNext}>Continue</BookingContinueButton>
    </> : null}
    <View style={screenStyles.homeSupport}>
      <Text accessibilityRole="header" style={screenStyles.supportTitle}>Need a hand?</Text>
      <View style={screenStyles.tileRow}>
        <ActionTile icon="phone" label="Call us" accessibilityLabel={`Call ${PHONE_DISPLAY}`} onPress={() => { void Linking.openURL('tel:' + PHONE_TEL); }} />
        <ActionTile icon="message-circle" label="Chat" accessibilityLabel="Chat with our team" onPress={() => router.push('/chat')} />
        <ActionTile icon="phone-incoming" label="Call me back" accessibilityLabel="Request a callback" onPress={() => setCallbackOpen(value => !value)} />
      </View>
      {callbackOpen ? <CustomerCallbackRequest startOpen onCancel={() => setCallbackOpen(false)} name={state.customerName} phone={state.customerPhone} notes="Callback requested from the customer booking app." /> : null}
    </View>
    <CustomerAssistedHelpRequest />
  </View>;
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
  const requestId = useRef(0);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const check = useCallback(async () => {
    if (state.lat == null || state.lng == null) return;
    const id = ++requestId.current;
    const current = () => active.current && id === requestId.current;
    setLoading(true);
    setError(null);
    setRouteCoordinates(null);
    try {
      const data = await requestJson<EligibilityResult>(API.eligibility, {
        method: 'POST',
        body: JSON.stringify({ lat: state.lat, lng: state.lng }),
      });
      if (!current()) return;
      setResult(data);
      void getDrivingRouteCoordinates({
        customerLat: state.lat,
        customerLng: state.lng,
        driverLat: data.driverLat,
        driverLng: data.driverLng,
      })
        .then(route => { if (current()) setRouteCoordinates(route); })
        .catch(() => { if (current()) setRouteCoordinates(null); });
    } catch (err) {
      if (!current()) return;
      setError(err instanceof Error ? err.message : 'Unable to check availability.');
    } finally {
      if (current()) setLoading(false);
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
        <ScreenHeader title="Outside service area" detail={result?.message} />
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
  const routeLineCoordinates = routeCoordinates;

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader title={result.driversOnline > 0 ? 'Emergency service available' : 'Confirm availability with our team'} detail={result.message} />
      {state.lat != null && state.lng != null ? (
        <PulsingMap
          markers={routeMarkers}
          routeCoordinates={routeLineCoordinates}
          style={screenStyles.mapImageTall}
        />
      ) : null}
      <Card style={screenStyles.etaCard}>
        <Text style={screenStyles.etaLabel}>Estimated arrival</Text>
        <Text style={screenStyles.etaText}>{result.etaLabel || 'Team to confirm'}</Text>
        <Text style={screenStyles.mutedCentered}>
          {[result.driverName ? `Nearest driver: ${result.driverName}` : null, `${result.driversOnline} driver${result.driversOnline === 1 ? '' : 's'} online`].filter(Boolean).join(' · ')}
        </Text>
      </Card>
      {result.driversOnline === 0 ? <><InlineNotice>No live driver is currently available to confirm this estimate. Call us or request a callback before paying.</InlineNotice><PrimaryButton icon="phone" onPress={() => { void Linking.openURL(`tel:${PHONE_TEL}`); }}>Call the team</PrimaryButton><CustomerCallbackRequest name={state.customerName} phone={state.customerPhone} notes={`Emergency availability at ${state.address}`} /></> :
      <BookingContinueButton icon="arrow-right" onPress={() => {
        updateState({
          emergencyEtaLabel: result.etaLabel,
          nearestDriverName: result.driverName,
        });
        goNext();
      }}>
        Continue
      </BookingContinueButton>
      }
    </View>
  );
}

interface SizeSuggestion {
  size: string;
  count: number;
}

type FeatherName = ComponentProps<typeof Feather>['name'];

const PROBLEM_OPTIONS: {
  value: ProblemType;
  title: string;
  detail: string;
  meta: string;
  icon: FeatherName;
  condition: ConditionAssessment;
}[] = [
  {
    value: 'puncture',
    title: 'Puncture or slow leak',
    detail: 'Nail, small puncture, or pressure dropping.',
    meta: 'Repair check',
    icon: 'tool',
    condition: 'repair',
  },
  {
    value: 'flat_tyre',
    title: 'Flat tyre',
    detail: 'Tyre is flat now and you need roadside help.',
    meta: 'Fast rescue',
    icon: 'alert-triangle',
    condition: 'not_sure',
  },
  {
    value: 'damaged_tyre',
    title: 'Damaged or worn tyre',
    detail: 'Sidewall damage, blowout, or tread is too low.',
    meta: 'Replacement',
    icon: 'disc',
    condition: 'replacement',
  },
  {
    value: 'not_sure',
    title: 'Not sure',
    detail: 'Send the details and our driver will assess it.',
    meta: 'Assessment',
    icon: 'help-circle',
    condition: 'not_sure',
  },
];

const LOCKING_NUT_OPTIONS: readonly { value: BookingState['lockingNutStatus']; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'has_key', label: 'I have the key' },
  { value: 'no_key', label: 'No key' },
];

function conditionToProblemType(condition: ConditionAssessment | null): ProblemType | null {
  if (condition === 'repair') return 'puncture';
  if (condition === 'replacement') return 'damaged_tyre';
  if (condition === 'not_sure') return 'not_sure';
  return null;
}

function problemTitle(problemType: ProblemType | null) {
  return PROBLEM_OPTIONS.find((item) => item.value === problemType)?.title ?? 'Tyre problem';
}

function ProblemCard({
  option,
  selected,
  onPress,
}: {
  option: (typeof PROBLEM_OPTIONS)[number];
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${option.title}. ${option.detail} ${option.meta}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        screenStyles.problemCard,
        selected ? screenStyles.problemCardSelected : null,
        pressed ? screenStyles.problemCardPressed : null,
      ]}
    >
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[screenStyles.problemIcon, selected ? screenStyles.problemIconSelected : null]}>
        <Feather accessible={false} name={option.icon} size={20} color={selected ? colors.accent : colors.muted} />
      </View>
      <Text style={[screenStyles.problemTitle, selected ? screenStyles.problemTitleSelected : null]}>
        {option.title}
      </Text>
      <Text style={screenStyles.problemDetail}>{option.meta}</Text>
    </Pressable>
  );
}

function DetailsStep({ state, updateState, goTo }: StepProps) {
  const [vehicleReg, setVehicleReg] = useState(state.vehicleReg);
  const [vehicleMake, setVehicleMake] = useState(state.vehicleMake);
  const [vehicleModel, setVehicleModel] = useState(state.vehicleModel);
  const [width, setWidth] = useState(state.tyreSize.width);
  const [aspect, setAspect] = useState(state.tyreSize.aspect);
  const [rim, setRim] = useState(state.tyreSize.rim);
  const [problemType, setProblemType] = useState<ProblemType | null>(
    state.problemType ?? conditionToProblemType(state.conditionAssessment),
  );
  const [condition, setCondition] = useState<ConditionAssessment | null>(state.conditionAssessment);
  const [quantity, setQuantity] = useState(clampQuantity(state.quantity));
  const [lockingNut, setLockingNut] = useState(state.lockingNutStatus);
  const [photoUrl, setPhotoUrl] = useState<string | null>(state.tyrePhotoUrl);
  const [popular, setPopular] = useState<SizeSuggestion[]>([]);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  };

  const photoRequest = useRef(0);
  const photoMounted = useRef(true);
  const photoUploadController = useRef<AbortController | null>(null);
  const [unknownSize, setUnknownSize] = useState(false);
  useEffect(() => { photoMounted.current = true; return () => { photoMounted.current = false; photoUploadController.current?.abort(); }; }, []);
  const pickPhoto = async (camera: boolean) => {
    if (uploading) return;
    const revision = ++photoRequest.current;
    const current = () => photoMounted.current && photoRequest.current === revision;
    let uploadTimer: ReturnType<typeof setTimeout> | undefined;
    let uploadTimedOut = false;
    setUploading(true); setError(null);
    try {
      const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!current()) return;
      if (permission.status !== 'granted') throw new Error(camera ? 'Camera access is off. You can choose a photo from your library instead.' : 'Photo access is off. You can continue without a photo.');
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.78, allowsEditing: false, exif: false, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!current() || result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) throw new Error('Choose a photo smaller than 10 MB.');
      const mime = asset.mimeType || 'image/jpeg';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('Choose a JPEG, PNG or WebP photo.');
      const form = new FormData();
      if (Platform.OS === 'web') {
        const image = await fetch(asset.uri); const blob = await image.blob();
        if (blob.size > 10 * 1024 * 1024) throw new Error('Choose a photo smaller than 10 MB.');
        form.append('file', blob, asset.fileName || 'tyre-photo.jpg');
      } else form.append('file', { uri: asset.uri, name: asset.fileName || 'tyre-photo.jpg', type: mime } as unknown as Blob);
      const controller = new AbortController();
      photoUploadController.current = controller;
      uploadTimer = setTimeout(() => { uploadTimedOut = true; controller.abort(); }, 30_000);
      const res = await fetchApi(API.uploadTyrePhoto, { method: 'POST', body: form, headers: { Accept: 'application/json' }, signal: controller.signal });
      const data = await res.json();
      if (!res.ok || typeof data.url !== 'string') throw new Error(data.error || 'Photo upload failed.');
      if (current()) { setPhotoUrl(data.url); updateState({ tyrePhotoUrl: data.url }); }
    } catch (err) { if (current()) setError(uploadTimedOut ? 'Photo upload timed out. Please try again when connected.' : err instanceof Error ? err.message : 'Photo upload failed.'); }
    finally { if (uploadTimer) clearTimeout(uploadTimer); photoUploadController.current = null; if (current()) setUploading(false); }
  };

  const canContinue = width.length >= 3 && aspect.length >= 2 && rim.length >= 2 && condition;
  const showQuantity = condition === 'repair' || state.bookingType === 'emergency';
  const selectedProblem = PROBLEM_OPTIONS.find(option => option.value === problemType);
  const vehicleSummary = [vehicleReg, vehicleMake, vehicleModel].filter(Boolean).join(' · ');
  const extrasSummary = [
    LOCKING_NUT_OPTIONS.find(option => option.value === lockingNut)?.label,
    photoUrl ? 'Photo added' : 'No photo',
  ].join(' · ');

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader title="About your tyre" detail="The size is printed on the side of the tyre, like 205/55 R16." />

      <Card style={screenStyles.sizeCard}>
        <Text accessibilityRole="header" style={screenStyles.cardHeading}>Tyre size</Text>
        <View style={screenStyles.sizeRow}>
          <TextField label="Width" value={width} onChangeText={(v) => setWidth(v.replace(/\D/g, '').slice(0, 3))} placeholder="205" keyboardType="number-pad" style={screenStyles.sizeField} inputStyle={screenStyles.sizeInput} />
          <TextField label="Profile" accessibilityLabel="Aspect ratio" value={aspect} onChangeText={(v) => setAspect(v.replace(/\D/g, '').slice(0, 2))} placeholder="55" keyboardType="number-pad" style={screenStyles.sizeField} inputStyle={screenStyles.sizeInput} />
          <TextField label="Rim" value={rim} onChangeText={(v) => setRim(v.replace(/\D/g, '').slice(0, 2))} placeholder="16" keyboardType="number-pad" style={screenStyles.sizeField} inputStyle={screenStyles.sizeInput} />
        </View>
        {popular.length > 0 ? (
          <View style={screenStyles.chipWrap}>
            {popular.slice(0, 6).map((item) => {
              const parsed = parseSize(item.size);
              const selected = Boolean(parsed && parsed.width === width && parsed.aspect === aspect && parsed.rim === rim);
              return <Chip key={item.size} label={item.size} selected={selected} accessibilityLabel={`Use tyre size ${item.size}`} onPress={() => chooseSize(item.size)} />;
            })}
          </View>
        ) : null}
        <PrimaryButton variant="ghost" icon={unknownSize ? 'check' : 'help-circle'} disabled={uploading} onPress={() => setUnknownSize(value => !value)}>
          {unknownSize ? 'I know my tyre size' : "I don't know my tyre size"}
        </PrimaryButton>
      </Card>

      {!unknownSize ? <>
        <Section title="What happened?">
          <View style={screenStyles.problemGrid}>
            {PROBLEM_OPTIONS.map((option) => (
              <ProblemCard
                key={option.value}
                option={option}
                selected={problemType === option.value}
                onPress={() => {
                  void Haptics.selectionAsync().catch(() => {});
                  setProblemType(option.value);
                  setCondition(option.condition);
                }}
              />
            ))}
          </View>
          {selectedProblem ? <Text style={screenStyles.problemHint}>{selectedProblem.detail}</Text> : null}
        </Section>

        {showQuantity ? (
          <Section title="How many tyres?">
            <Segmented accessibilityLabel="Number of tyres" value={quantity} onChange={setQuantity}
              options={[1, 2, 3, 4].map(value => ({ value, label: String(value) }))} />
          </Section>
        ) : null}
      </> : null}

      <Disclosure key={unknownSize ? 'vehicle-help' : 'vehicle'} title="Vehicle details" summary={vehicleSummary || 'Optional · helps us bring the right tyre'}
        initiallyOpen={unknownSize || Boolean(vehicleReg)}>
        <View style={screenStyles.inlineFields}>
          <View style={screenStyles.flex}>
            <TextField label="Registration" value={vehicleReg} onChangeText={(v) => setVehicleReg(v.toUpperCase())} placeholder="AB12 CDE" autoCapitalize="characters" />
          </View>
          <PrimaryButton icon="search" variant="secondary" loading={loadingLookup} style={screenStyles.lookupButton} onPress={lookupVehicle}>
            Find
          </PrimaryButton>
        </View>
        <View style={screenStyles.sizeRow}>
          <TextField label="Make" value={vehicleMake} onChangeText={setVehicleMake} placeholder="Ford" style={screenStyles.flex} />
          <TextField label="Model" value={vehicleModel} onChangeText={setVehicleModel} placeholder="Focus" style={screenStyles.flex} />
        </View>
      </Disclosure>

      <Disclosure title="Wheel nuts and photo" summary={extrasSummary} initiallyOpen={lockingNut !== 'standard' || Boolean(photoUrl)}>
        <Text style={screenStyles.fieldHeading}>Locking wheel nuts</Text>
        <Segmented accessibilityLabel="Locking wheel nuts" value={lockingNut} onChange={setLockingNut} options={LOCKING_NUT_OPTIONS} />
        <LockingNutPriceNotice status={lockingNut} />
        <Text style={screenStyles.fieldHeading}>Tyre photo</Text>
        <Text style={screenStyles.fieldHint}>Optional. A photo helps the driver prepare.</Text>
        {photoUrl ? <Image accessibilityLabel="Attached tyre photo" source={{ uri: photoUrl }} style={screenStyles.photoPreview} /> : null}
        <View style={screenStyles.sizeRow}>
          <PrimaryButton icon="image" variant="secondary" loading={uploading} style={screenStyles.flex} onPress={() => { void pickPhoto(false); }}>
            {photoUrl ? 'Replace' : 'Library'}
          </PrimaryButton>
          {Platform.OS !== 'web' ? <PrimaryButton icon="camera" variant="secondary" disabled={uploading} style={screenStyles.flex} onPress={() => { void pickPhoto(true); }}>Camera</PrimaryButton> : null}
        </View>
        {photoUrl ? <PrimaryButton variant="ghost" icon="trash-2" disabled={uploading} onPress={() => { setPhotoUrl(null); updateState({ tyrePhotoUrl: null }); }}>Remove photo</PrimaryButton> : null}
      </Disclosure>

      {unknownSize ? <CustomerAssistedHelpRequest name={state.customerName} phone={state.customerPhone} details={{ address: state.address, lat: state.lat ?? NaN, lng: state.lng ?? NaN, vehicleReg, vehicleMake, vehicleModel, photoUrl: photoUrl || undefined }} /> : null}

      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}

      {!unknownSize ? <BookingContinueButton
        icon="arrow-right"
        disabled={unknownSize || !canContinue || uploading}
        onPress={() => {
          if (unknownSize || !condition || uploading) return;
          const nextServiceType = condition === 'repair' ? 'repair' : condition === 'replacement' ? 'fit' : 'assess';
          const shouldClearTyres =
            condition === 'repair' ||
            state.problemType !== problemType ||
            state.conditionAssessment !== condition ||
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
            problemType,
            conditionAssessment: condition,
            serviceType: nextServiceType,
            quantity: clampQuantity(quantity),
            lockingNutStatus: lockingNut,
            tyrePhotoUrl: photoUrl,
            selectedTyres: shouldClearTyres ? [] : state.selectedTyres,
            fulfillmentOption: shouldClearTyres ? null : state.fulfillmentOption,
          });
          const nextStep = getAdjacentStep(getSteps(state.bookingType, nextServiceType, state.fittingLocation), 'details', 1);
          if (nextStep) goTo(nextStep);
        }}
      >
        Continue
      </BookingContinueButton> : null}
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
      <ScreenHeader title="Choose your tyres" detail={`${tyreSizeDisplay(state.tyreSize)} · up to 4 tyres. Prices are per tyre; fitting is added in your quote.`} />
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {!error && tyres.length === 0 ? (
        <EmptyBox>No tyres are listed for this size right now. Call us and we can source one.</EmptyBox>
      ) : null}

      {tyres.map((tyre) => {
        const item = state.selectedTyres.find((cartItem) => cartItem.tyreId === tyre.id);
        const inStock = tyre.availableNew && tyre.stockNew >= 1;
        const canAdd = totalItems < 4 && tyre.priceNew != null;
        const details = [tyre.tier, tyre.season, tyre.wetGrip ? `Wet grip ${tyre.wetGrip}` : null].filter(Boolean).join(' · ');
        return (
          <Card key={tyre.id} style={[screenStyles.tyreCard, item ? screenStyles.selectedTyreCard : null]}>
            <View style={screenStyles.tyreTop}>
              <View style={screenStyles.flex}>
                <Text style={screenStyles.tyreBrand}>{tyre.brand}</Text>
                <Text style={screenStyles.tyrePattern}>{tyre.pattern}</Text>
              </View>
              <View style={screenStyles.priceStack}>
                <Text style={screenStyles.tyrePrice}>{tyre.priceNew != null ? formatPrice(tyre.priceNew) : 'Call for price'}</Text>
                {tyre.priceNew != null ? <Text style={screenStyles.tyreMeta}>per tyre</Text> : null}
              </View>
            </View>
            <View style={screenStyles.tyreMetaRow}>
              <Pill tone={tyre.isOrderOnly ? 'accent' : inStock ? 'success' : 'neutral'}>
                {tyre.isOrderOnly ? tyre.leadTimeLabel || 'Special order' : inStock ? 'In stock' : 'Pre-order'}
              </Pill>
              {details ? <Text style={screenStyles.tyreMeta}>{details}</Text> : null}
            </View>
            {item ? (
              <View style={screenStyles.cartControls}>
                <Text style={screenStyles.cartAdded}>{formatPrice(item.unitPrice * item.quantity)} added</Text>
                <QuantityStepper label={`${tyre.brand} ${tyre.pattern} tyres`} value={item.quantity} max={item.quantity + (4 - totalItems)}
                  onChange={(value) => setCart(updateCartQuantity(state.selectedTyres, tyre.id, value))} />
              </View>
            ) : (
              <PrimaryButton
                icon="plus"
                variant="secondary"
                disabled={!canAdd}
                accessibilityLabel={`Add ${tyre.brand} ${tyre.pattern} to booking`}
                onPress={() => (tyre.isOrderOnly ? setOrderPrompt(tyre) : addTyre(tyre))}
              >
                Add
              </PrimaryButton>
            )}
          </Card>
        );
      })}

      <BookingContinueButton icon="arrow-right" disabled={state.selectedTyres.length === 0} onPress={goNext}>
        {totalItems > 0 ? `Continue with ${totalItems} tyre${totalItems === 1 ? '' : 's'}` : 'Choose a tyre to continue'}
      </BookingContinueButton>

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

function ScheduleStep({ state, updateState, goNext, goTo }: StepProps) {
  const [fittingLocation, setFittingLocation] = useState<FittingLocation | null>(state.fittingLocation);
  const [selectedDate, setSelectedDate] = useState(state.scheduledDate || londonDate());
  const [selectedTime, setSelectedTime] = useState(state.scheduledTime || '');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dates = useMemo(() => londonDateChoices(), []);

  useEffect(() => {
    let mounted = true;
    async function loadSlots() {
      setLoading(true);
      setSlots([]);
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
      <ScreenHeader title="Pick a date and time" detail="Times are shown in UK time." />

      <Section title="Where">
        {state.fittingLocation ? <Card style={screenStyles.compactCard}>
          <SummaryItem icon={state.fittingLocation === 'shop' ? 'home' : 'map-pin'} title={state.fittingLocation === 'shop' ? 'At our workshop' : 'At your location'}
            detail={state.address || null} editLabel="Change fitting location" onEdit={() => goTo('service')} />
        </Card> :
        <View style={screenStyles.twoGrid}>
          <OptionCard title="At the shop" detail="No extra fee." meta="Shop" metaTone="success" icon="home" selected={fittingLocation === 'shop'} onPress={() => setFittingLocation('shop')} />
          <OptionCard title="At your location" detail="Priced in quote." meta="Mobile" metaTone="accent" icon="map-pin" selected={fittingLocation === 'mobile'} onPress={() => setFittingLocation('mobile')} />
        </View>}
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

      <BookingContinueButton
        icon="arrow-right"
        disabled={loading || Boolean(error) || !fittingLocation || !slots.some(slot => slot.available && slot.time === selectedTime)}
        onPress={() => {
          updateState({
            ...quoteReset,
            fittingLocation,
            scheduledDate: selectedDate,
            scheduledTime: selectedTime,
            slotId: slots.find(slot => slot.time === selectedTime && slot.available)?.slotId || null,
          });
          goNext();
        }}
      >
        Continue
      </BookingContinueButton>
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
  const candidates = withStock.sort((a, b) => Number(a.priceNew) - Number(b.priceNew));
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

function QuoteStep(props: StepProps) {
  const { state, updateState, goTo } = props;
  const [loading, setLoading] = useState(!state.breakdown);
  const [creatingBooking, setCreatingBooking] = useState(false);
  const bookingCreationLocked = useRef(false);
  const quoteRequestPending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const mounted = useRef(true);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);

  const requestQuote = useCallback(async () => {
    if (bookingCreationLocked.current || quoteRequestPending.current || state.lat == null || state.lng == null || !state.bookingType) return;
    quoteRequestPending.current = true;
    const requestRevision = ++revision.current;
    const current = () => mounted.current && requestRevision === revision.current;
    setLoading(true);
    setError(null);
    try {
      const isRepair = state.serviceType === 'repair' || state.conditionAssessment === 'repair';
      const isEmergencyWithoutTyres = state.bookingType === 'emergency' && state.selectedTyres.length === 0 && !isRepair;
      const autoTyre = isEmergencyWithoutTyres ? await findCheapestMatchingTyre(state) : null;
      if (!current()) return;
      if (isEmergencyWithoutTyres && !autoTyre && !isRepair) throw new Error('Our team needs to confirm a suitable tyre and price. Request a callback or call us for help.');
      const sendAsRepair = isRepair;
      const selections = autoTyre ? [autoTyre] : sendAsRepair ? [] : state.selectedTyres;
      const serviceType = autoTyre ? autoTyre.service : sendAsRepair ? 'repair' : state.serviceType || 'fit';
      const scheduledAt = state.scheduledDate && state.scheduledTime ? londonScheduledAt(state.scheduledDate, state.scheduledTime) : undefined;

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

      if (!current()) return;
      updateState({
        quoteId: data.quoteId,
        quoteExpiresAt: data.expiresAt,
        breakdown: data.breakdown,
        selectedTyres: autoTyre ? [autoTyre] : sendAsRepair ? [] : state.selectedTyres,
      });
    } catch (err) {
      if (!current()) return;
      const message = err instanceof Error ? err.message : 'Failed to get quote.';
      if (message.toLowerCase().includes('slot')) goTo('schedule');
      setError(message);
    } finally {
      quoteRequestPending.current = false;
      if (current()) setLoading(false);
    }
  }, [goTo, state, updateState]);

  useEffect(() => {
    if (!state.breakdown || !state.quoteId) requestQuote();
  }, [requestQuote, state.breakdown, state.quoteId]);

  if (loading && !state.breakdown) return <LoadingState label="Calculating live quote..." />;

  const total = state.breakdown?.total ?? 0;
  const expiresAt = state.quoteExpiresAt ? Date.parse(state.quoteExpiresAt) : Number.NaN;
  const expired = !Number.isFinite(expiresAt) || expiresAt <= now;

  return (
    <View style={screenStyles.stepGap}>
      {!state.breakdown ? <ScreenHeader title="Review and pay" detail="We couldn't get a live price yet." /> : null}
      {error ? (
        <>
          <InlineNotice tone="danger">{error}</InlineNotice>
          <PrimaryButton icon="refresh-cw" disabled={creatingBooking} onPress={requestQuote}>Retry</PrimaryButton>
          <CustomerCallbackRequest name={state.customerName} phone={state.customerPhone} notes={['Help with a booking quote.', state.vehicleReg, state.address, state.tyrePhotoUrl || ''].filter(Boolean).join(' ')} />
        </>
      ) : null}
      {state.breakdown ? (
        <>
          {expired ? <InlineNotice tone="accent">Your quote has expired. Refresh the price to continue; your details will be kept.</InlineNotice> : null}
          <CustomerStep {...props} quoteReady={total > 0 && !loading && !error && !expired}
            canSubmit={() => !quoteRequestPending.current}
            setNavigationLocked={(locked) => { bookingCreationLocked.current = locked; setCreatingBooking(locked); props.setNavigationLocked?.(locked); }} />
          <View style={screenStyles.quoteMeta}>
            {!expired ? <Text style={screenStyles.mutedCentered}>Price held until {new Date(state.quoteExpiresAt!).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })} UK time</Text> : null}
            <PrimaryButton icon="refresh-cw" variant="ghost" loading={loading} disabled={creatingBooking} onPress={requestQuote}>
              Refresh quote
            </PrimaryButton>
          </View>
        </>
      ) : null}
    </View>
  );
}

function CustomerStep({
  state,
  updateState,
  goNext,
  goTo,
  setNavigationLocked,
  quoteReady = true,
  canSubmit,
}: StepProps & { quoteReady?: boolean; canSubmit?: () => boolean }) {
  const { profile, token } = useCustomerAccount();
  const [name, setName] = useState(state.customerName || profile?.name || '');
  const [email, setEmail] = useState(state.customerEmail || profile?.email || '');
  const [phone, setPhone] = useState(state.customerPhone || profile?.phone || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quoteNeedsRestart = error ? requiresNewQuote(error) : false;
  const creating = useRef(false);
  const [accessScope] = useState(bookingAccessScope);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!profile) return;
    if (!state.customerName && !name) setName(profile.name);
    if (!state.customerEmail && !email) setEmail(profile.email);
    if (!state.customerPhone && !phone && profile.phone) setPhone(profile.phone);
  }, [email, name, phone, profile, state.customerEmail, state.customerName, state.customerPhone]);

  const submit = async () => {
    if (creating.current || !quoteReady || canSubmit?.() === false) return;
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    if (!name.trim()) return setError('Full name is required.');
    if (!EMAIL_RE.test(trimmedEmail)) return setError('Enter a valid email address.');
    if (!PHONE_RE.test(trimmedPhone.replace(/\s/g, ''))) return setError('Enter a valid UK phone number.');
    if (!state.quoteId) return setError('Quote is missing. Please refresh the quote.');
    const expiresAt = state.quoteExpiresAt ? Date.parse(state.quoteExpiresAt) : Number.NaN;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return setError('Quote has expired. Please refresh the quote.');

    creating.current = true;
    setNavigationLocked?.(true);
    setLoading(true);
    setError(null);
    try {
      const data = await requestJson<{
        bookingId: string;
        refNumber: string;
        stripeClientSecret: string;
        bookingAccessToken: string;
      }>(API.createBooking, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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
      if (!mounted.current || accessScope !== bookingAccessScope()) return;
      await saveBookingAccess(data.refNumber, data.bookingAccessToken, accessScope).catch(() => {});
      updateState({
        customerName: name.trim(),
        customerEmail: trimmedEmail,
        customerPhone: trimmedPhone,
        bookingId: data.bookingId,
        refNumber: data.refNumber,
        stripeClientSecret: data.stripeClientSecret,
        bookingAccessToken: data.bookingAccessToken,
      });
      goNext();
    } catch (err) {
      if (!mounted.current || accessScope !== bookingAccessScope()) return;
      const message = err instanceof Error ? err.message : 'Failed to create booking.';
      if (message.toLowerCase().includes('slot')) goTo('schedule');
      setError(message);
    } finally {
      creating.current = false;
      setNavigationLocked?.(false);
      setLoading(false);
    }
  };

  const serviceLabel = state.serviceType === 'repair' ? 'Puncture repair' : state.serviceType === 'assess' ? 'Tyre assessment' : 'Tyre fitting';
  // Fitted tyres carry their own quantities; the separate quantity only applies to repairs and assessments.
  const tyreTitle = state.selectedTyres.length > 0
    ? state.selectedTyres.map((tyre) => `${tyre.quantity} × ${tyre.brand} ${tyre.pattern}`).join(', ')
    : `${serviceLabel}${state.quantity > 1 ? ` · ${state.quantity} tyres` : ''}`;
  const tyreDetail = [
    tyreSizeDisplay(state.tyreSize),
    problemTitle(state.problemType),
    [state.vehicleReg, state.vehicleMake, state.vehicleModel].filter(Boolean).join(' '),
    state.tyrePhotoUrl ? 'Photo attached' : null,
  ].filter(Boolean).join(' · ');
  const when = state.bookingType === 'scheduled'
    ? `${formatAppointment(state.scheduledDate, state.scheduledTime)} (UK time)`
    : state.emergencyEtaLabel ? `Estimated arrival ${state.emergencyEtaLabel}` : 'Our team will confirm the arrival time';

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader title="Review and pay" detail="You're only charged when you complete secure payment." />
      {state.breakdown ? (
        <>
          <Card style={screenStyles.compactCard}>
            <SummaryItem icon={state.fittingLocation === 'shop' ? 'home' : 'map-pin'} title={state.address || 'Location'} detail={when}
              editLabel="Edit location" disabled={loading} onEdit={() => goTo(state.fittingLocation === 'shop' ? 'service' : 'location')} />
            <View style={screenStyles.divider} />
            <SummaryItem icon="disc" title={tyreTitle} detail={tyreDetail || null}
              editLabel="Edit vehicle or tyres" disabled={loading} onEdit={() => goTo('details')} />
          </Card>
          <Card style={screenStyles.priceCard}>
            {(state.breakdown.lineItems || []).map((item, index) => <Row key={`${item.type}-${index}`} label={item.label} value={formatPrice(item.amount)} />)}
            <View style={screenStyles.divider} />
            <Row label="Subtotal" value={formatPrice(state.breakdown.subtotal)} />
            <Row label="VAT" value={formatPrice(state.breakdown.vatAmount)} />
            <Row label="Total to pay" value={formatPrice(state.breakdown.total)} valueStyle={screenStyles.totalValue} />
          </Card>
        </>
      ) : null}
      <Section title="Your details">
        <TextField label="Full name" value={name} onChangeText={value => { setName(value); updateState({ customerName: value }); }} placeholder="John Smith" autoComplete="name" />
        <TextField label="Email" value={email} onChangeText={value => { setEmail(value); updateState({ customerEmail: value }); }} placeholder="john@example.com" keyboardType="email-address" autoComplete="email" />
        <TextField label="Phone" value={phone} onChangeText={value => { setPhone(value); updateState({ customerPhone: value }); }} placeholder="07123 456789" keyboardType="phone-pad" autoComplete="tel" />
      </Section>
      <LockingNutPriceNotice status={state.lockingNutStatus} />
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {quoteNeedsRestart ? (
        <BookingContinueButton icon="refresh-cw" onPress={() => { updateState({ ...quoteReset, customerName: name, customerEmail: email, customerPhone: phone }); goTo('quote'); }}>
          Refresh price and keep my details
        </BookingContinueButton>
      ) : (
        <BookingContinueButton icon="lock" loading={loading} disabled={!quoteReady} onPress={submit}>
          {state.breakdown ? `Continue to payment · ${formatPrice(state.breakdown.total)}` : 'Continue to payment'}
        </BookingContinueButton>
      )}
    </View>
  );
}

function PaymentStep({ state, updateState, goTo, setNavigationLocked }: StepProps) {
  const [draftSession] = useState(bookingDraftSession);
  const { token } = useCustomerAccount();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirming = useRef(false);
  const [recoveredAmount, setRecoveredAmount] = useState<number | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [checkoutActive, setCheckoutActive] = useState(false);
  const [recoveryVersion, setRecoveryVersion] = useState(0);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const automaticRecovery = useRef<string | null>(null);
  const paymentMounted = useRef(true);
  const operation = useRef<'checkout' | 'recovery' | null>(null);
  const currentSession = useCallback(() => paymentMounted.current && draftSession === bookingDraftSession(), [draftSession]);
  useEffect(() => {
    paymentMounted.current = true;
    return () => { paymentMounted.current = false; };
  }, []);
  const amountLabel = state.breakdown ? formatPrice(state.breakdown.total) : recoveredAmount !== null ? formatPrice(recoveredAmount) : 'See your booking receipt';
  const checkPaymentStatus = useCallback(async (paymentIntentId: string): Promise<CustomerPaymentStatus> => {
    if (!currentSession() || !state.refNumber) throw new Error('Your account session changed. Please reopen this booking.');
    const result = await requestJson<unknown>(`/api/mobile/customer/bookings/${encodeURIComponent(state.refNumber)}/payment?paymentIntentId=${encodeURIComponent(paymentIntentId)}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(state.bookingAccessToken ? { 'X-Booking-Access': state.bookingAccessToken } : {}) },
    });
    if (!currentSession()) throw new Error('Your account session changed. Please reopen this booking.');
    return validateCustomerPaymentStatus(result, paymentIntentId);
  }, [currentSession, state.refNumber, state.bookingAccessToken, token]);
  const handlePaid = useCallback(
    async (paymentIntentId: string) => {
      if (confirming.current || !currentSession()) return;
      if (!state.refNumber) throw new Error('Booking reference is missing.');
      confirming.current = true;
      setChecking(true); setError(null);
      try {
      updateState({ pendingPaymentIntentId: paymentIntentId });
      await saveBookingDraft({ ...state, pendingPaymentIntentId: paymentIntentId }, 'payment', draftSession).catch(() => {});
      if (!currentSession()) return;
      const confirmation = await withDeadline(requestJson<{
        status: string;
        paymentConfirmed: boolean;
        bookingAccessToken?: string;
        invoiceDownloadToken?: string;
      }>(API.confirmBooking, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(state.bookingAccessToken ? { 'X-Booking-Access': state.bookingAccessToken } : {}) },
        body: JSON.stringify({
          bookingId: state.refNumber,
          paymentIntentId,
        }),
      }), 30000, 'Confirmation is taking longer than expected. Check the same payment again; do not pay again.');
      requireConfirmedBooking(confirmation);
      if (!currentSession()) return;
      updateState({ pendingPaymentIntentId: null, paymentAttemptIntentId: null, bookingAccessToken: confirmation.bookingAccessToken || state.bookingAccessToken });
      if (confirmation.invoiceDownloadToken) {
        updateState({ invoiceDownloadToken: confirmation.invoiceDownloadToken });
      }
      goTo('done');
      } catch (err) {
        if (currentSession()) setError(err instanceof Error ? err.message : 'Unable to confirm this booking yet.');
        throw err;
      } finally { confirming.current = false; if (currentSession()) setChecking(false); }
    },
    [goTo, state, token, updateState, draftSession, currentSession],
  );

  const recoverPayment = useCallback(async () => {
    const expectedPayment = state.pendingPaymentIntentId || state.paymentAttemptIntentId;
    if (operation.current || !expectedPayment || !currentSession()) return;
    operation.current = 'recovery';
    setRecovering(true); setError(null); setPaymentNotice(null);
    try {
      const result = await checkPaymentStatus(expectedPayment);
      if (!currentSession()) return;
      if (result.canResume && result.clientSecret) {
        // Keep a durable reference until this same intent is completed or safely cancelled.
        const updates = { stripeClientSecret: result.clientSecret, pendingPaymentIntentId: null, paymentAttemptIntentId: result.paymentIntentId };
        await saveBookingDraft({ ...state, ...updates }, 'payment', draftSession);
        if (!currentSession()) return;
        setRecoveredAmount(result.amountPence / 100);
        updateState(updates);
        setRecoveryVersion(value => value + 1);
        setPaymentNotice(result.status === 'requires_action' ? 'Authentication was not completed. Continue this payment below.' : 'Payment was not completed. You can retry this payment below.');
      } else if (result.status === 'succeeded') {
        await handlePaid(result.paymentIntentId);
      } else if (result.status === 'processing') {
        await saveBookingDraft({ ...state, pendingPaymentIntentId: result.paymentIntentId }, 'payment', draftSession);
        if (!currentSession()) return;
        updateState({ pendingPaymentIntentId: result.paymentIntentId });
        setPaymentNotice('Your bank is still processing this payment. Check its status again shortly; do not pay again.');
      } else if (result.status === 'canceled') {
        setError('This payment was cancelled. Please contact the team to restart this booking.');
      } else {
        setError('This payment needs help from our team. Please call us before making another booking.');
      }
    } catch (err) {
      if (currentSession()) setError(err instanceof Error ? err.message : 'Unable to check this payment. Please try again or contact the team.');
    } finally {
      if (operation.current === 'recovery') operation.current = null;
      if (currentSession()) setRecovering(false);
    }
  }, [checkPaymentStatus, currentSession, draftSession, handlePaid, state, updateState]);

  useEffect(() => {
    const expectedPayment = state.pendingPaymentIntentId || state.paymentAttemptIntentId;
    if (!expectedPayment || state.stripeClientSecret || automaticRecovery.current === expectedPayment || operation.current) return;
    automaticRecovery.current = expectedPayment;
    void recoverPayment();
  }, [recoverPayment, state.pendingPaymentIntentId, state.paymentAttemptIntentId, state.stripeClientSecret]);

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader title="Secure payment" detail="Card details are handled by Stripe and never stored on your phone." />
      <Card style={screenStyles.priceCard}>
        <Row label="Booking reference" value={state.refNumber || '-'} />
        <Row label="Total" value={amountLabel} valueStyle={screenStyles.totalValue} />
      </Card>
      <LockingNutPriceNotice status={state.lockingNutStatus} />
      {paymentNotice ? <InlineNotice>{paymentNotice}</InlineNotice> : null}
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {state.pendingPaymentIntentId ? <View style={{ gap: 12 }}>
        <InlineNotice>Your payment is being checked. You will not be charged again when you retry confirmation.</InlineNotice>
        <PrimaryButton loading={checking || recovering} disabled={checkoutActive} onPress={() => { void recoverPayment(); }}>Check payment status</PrimaryButton>
        <PrimaryButton icon="phone" variant="secondary" onPress={() => { void Linking.openURL(`tel:${PHONE_TEL}`); }}>Contact the team</PrimaryButton>
      </View> : state.stripeClientSecret && state.refNumber ? (
        <CustomerPaymentControl
          key={`${state.stripeClientSecret}:${recoveryVersion}`}
          amountLabel={amountLabel}
          clientSecret={state.stripeClientSecret}
          onPaid={handlePaid}
          onCheckPaymentStatus={checkPaymentStatus}
          refNumber={state.refNumber}
          disabled={recovering}
          onPaymentActivity={active => {
            if (active && !operation.current) operation.current = 'checkout';
            if (!active && operation.current === 'checkout') operation.current = null;
            setCheckoutActive(active); setNavigationLocked?.(active);
          }}
          onPaymentAttempt={async id => {
            if (operation.current === 'recovery') throw new Error('Wait for the current payment status check to finish.');
            if (!currentSession()) throw new Error('Your account session changed. Please reopen this booking.');
            await saveBookingDraft({ ...state, paymentAttemptIntentId: id }, 'payment', draftSession);
            if (!currentSession()) throw new Error('Your account session changed.');
            updateState({ paymentAttemptIntentId: id });
          }}
          onPaymentCancelled={async () => {
            if (!currentSession()) return;
            await saveBookingDraft({ ...state, paymentAttemptIntentId: null }, 'payment', draftSession);
            if (!currentSession()) return;
            updateState({ paymentAttemptIntentId: null });
          }}
        />
      ) : (
        <InlineNotice>{recovering ? 'Checking your previous payment…' : 'Check your payment status to safely continue this booking.'}</InlineNotice>
      )}
      {state.paymentAttemptIntentId && !state.pendingPaymentIntentId ? <PrimaryButton variant="secondary" loading={recovering} disabled={checkoutActive || checking} onPress={() => { void recoverPayment(); }}>Check this payment status</PrimaryButton> : null}
      {!state.pendingPaymentIntentId && (state.paymentAttemptIntentId || error) ? <PrimaryButton icon="phone" variant="secondary" onPress={() => { void Linking.openURL(`tel:${PHONE_TEL}`); }}>Contact the team</PrimaryButton> : null}
    </View>
  );
}

function DoneStep({ state, reset }: { state: BookingState; reset: () => void }) {
  const { token } = useCustomerAccount();
  const [accessScope] = useState(bookingAccessScope);
  const [notificationScope] = useState(customerPushScope);
  const [referenceCopied, setReferenceCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refNumber = state.refNumber ?? '';

  useEffect(() => {
    if (!state.refNumber || !state.customerEmail) return;
    const ref = state.refNumber;
    void (async () => {
      if (state.bookingAccessToken) await saveBookingAccess(ref, state.bookingAccessToken, accessScope);
      await registerForCustomerPushNotificationsAsync({ refNumber: ref, bookingAccessToken: state.bookingAccessToken || undefined, authToken: token || undefined, notificationScope });
    })().catch(() => {});
  }, [state.customerEmail, state.refNumber, state.bookingAccessToken, token, accessScope, notificationScope]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  async function copyReference() {
    if (!refNumber) return;
    await Clipboard.setStringAsync(refNumber);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setReferenceCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setReferenceCopied(false), 2200);
  }

  return (
    <View style={screenStyles.stepGap}>
      <View style={screenStyles.doneHero}>
        <View style={screenStyles.doneCheckBadge}>
          <Feather accessible={false} name="check" size={34} color={colors.success} />
        </View>
        <Text accessibilityRole="header" style={screenStyles.doneTitle}>Booking confirmed</Text>
        <Text style={screenStyles.mutedCentered}>{`${BUSINESS_NAME} has your booking. We'll send a confirmation by email and SMS.`}</Text>
      </View>
      <Card style={screenStyles.doneCard}>
        <Text style={screenStyles.etaLabel}>Booking reference</Text>
        <View style={screenStyles.doneRefRow}>
          <Text selectable style={screenStyles.doneRef}>{refNumber || '-'}</Text>
          {refNumber ? (
            <Pressable accessibilityLabel="Copy booking reference" accessibilityRole="button" onPress={copyReference} style={screenStyles.doneCopyButton}>
              <Feather name={referenceCopied ? 'check' : 'copy'} size={16} color={referenceCopied ? colors.success : colors.text} />
              <Text style={screenStyles.doneCopyText}>{referenceCopied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
          ) : null}
        </View>
      </Card>
      <PrimaryButton icon="map-pin" onPress={() => router.push({ pathname: '/track', params: { ref: refNumber, accessToken: state.bookingAccessToken || '' } })}>Track my booking</PrimaryButton>
      <View style={screenStyles.tileRow}>
        <ActionTile icon="message-circle" label="Chat" accessibilityLabel="Chat with our team" onPress={() => router.push({ pathname: '/chat', params: { bookingId: state.bookingId || '', refNumber, bookingAccessToken: state.bookingAccessToken || '' } })} />
        <ActionTile icon="phone" label="Call us" accessibilityLabel={`Call ${PHONE_DISPLAY}`} onPress={() => { void Linking.openURL(`tel:${PHONE_TEL}`); }} />
        {state.refNumber && state.invoiceDownloadToken ? (
          <ActionTile icon="download" label="Invoice" accessibilityLabel="Download invoice" onPress={() => { void Linking.openURL(customerInvoiceUrl(state.refNumber!, state.invoiceDownloadToken!)); }} />
        ) : null}
      </View>
      <AccountOffer state={state} />
      <PrimaryButton icon="plus" variant="ghost" onPress={reset}>Start a new booking</PrimaryButton>
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
        bookingAccessToken: state.bookingAccessToken || undefined,
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
    <Disclosure title="Save your details for next time" summary={`Create an account for ${state.customerEmail}`}>
      <TextField label="Password" value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry autoComplete="password-new" />
      <TextField label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm password" secureTextEntry autoComplete="password-new" />
      {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      <PrimaryButton
        icon="user-plus"
        variant="secondary"
        loading={busy}
        disabled={!password || !confirmPassword}
        onPress={createAccount}
      >
        Create account
      </PrimaryButton>
    </Disclosure>
  );
}

const quoteReset = resetBookingQuote;

const screenStyles = StyleSheet.create({
  root: { backgroundColor: colors.bg, flex: 1, overflow: 'hidden' },
  scroll: { flex: 1 },
  content: { gap: 20, paddingHorizontal: spacing.page, paddingBottom: 24 },
  topBlock: { gap: 14 },
  stepGap: { gap: 16 },
  stepMotion: { alignSelf: 'stretch' },
  flex: { flex: 1 },
  divider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth, marginVertical: 2 },
  compactCard: { gap: 10, paddingVertical: 12 },
  cardHeading: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 15, lineHeight: 21 },
  fieldHeading: { color: colors.text, fontFamily: typography.bodyMedium, fontSize: 14, lineHeight: 20 },
  fieldHint: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 18, marginTop: -8 },
  mutedCentered: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 19, textAlign: 'center' },

  progress: { gap: 8 },
  progressTrack: { backgroundColor: colors.surfaceRaised, borderRadius: 4, height: 4, overflow: 'hidden' },
  progressFill: { backgroundColor: colors.accent, borderRadius: 4, height: 4 },
  progressLabel: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 12, lineHeight: 16 },

  heroHeader: { alignSelf: 'stretch', gap: 6, marginTop: 4 },
  heroTitle: { color: colors.text, fontFamily: typography.heading, fontSize: 30, lineHeight: 36, flexShrink: 1 },
  heroDetail: { color: colors.muted, fontFamily: typography.body, fontSize: 15, lineHeight: 22, flexShrink: 1 },
  serviceChoice: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radii.xl, padding: 18, gap: 14 },
  emergencyChoice: { backgroundColor: colors.accent, borderColor: colors.accent },
  serviceChoiceSelected: { borderColor: colors.accentBorder, backgroundColor: colors.accentSoft },
  choicePressed: { opacity: 0.85 },
  serviceChoiceHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  serviceChoiceIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  emergencyChoiceIcon: { backgroundColor: 'rgba(26,13,4,0.12)' },
  serviceChoiceCopy: { gap: 4 },
  serviceChoiceTitle: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 20, lineHeight: 26 },
  serviceChoiceDetail: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 20 },
  emergencyChoiceText: { color: colors.onAccent },
  serviceChoiceMetaRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  emergencyMetaRow: { alignSelf: 'flex-start', backgroundColor: 'rgba(26,13,4,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  liveDot: { backgroundColor: colors.onAccent, borderRadius: 4, height: 8, width: 8 },
  serviceChoiceMeta: { color: colors.subtle, fontFamily: typography.bodyMedium, fontSize: 12, lineHeight: 16 },
  homeSupport: { gap: 10, marginTop: 4 },
  supportTitle: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 13, lineHeight: 18 },
  tileRow: { flexDirection: 'row', gap: 10 },

  mapImageTall: { backgroundColor: colors.surface, borderRadius: radii.lg, height: 220, width: '100%' },
  etaCard: { alignItems: 'center', gap: 6, paddingVertical: 20 },
  etaText: { color: colors.accent, fontFamily: typography.display, fontSize: 48, lineHeight: 50, textAlign: 'center' },
  etaLabel: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },

  sizeCard: { gap: 14 },
  sizeRow: { flexDirection: 'row', gap: 10 },
  sizeField: { flex: 1 },
  sizeInput: { fontFamily: typography.bodyBold, fontSize: 20, textAlign: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inlineFields: { alignItems: 'flex-end', flexDirection: 'row', gap: 10 },
  lookupButton: { minWidth: 96 },
  problemGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  problemCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, flexBasis: '47%', flexGrow: 1, gap: 8, minHeight: 112, padding: 14 },
  problemCardSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  problemCardPressed: { opacity: 0.85 },
  problemIcon: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 10, height: 36, justifyContent: 'center', width: 36 },
  problemIconSelected: { backgroundColor: colors.accentSoft },
  problemTitle: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 15, lineHeight: 20 },
  problemTitleSelected: { color: colors.accent },
  problemDetail: { color: colors.subtle, fontFamily: typography.body, fontSize: 12, lineHeight: 16 },
  problemHint: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 20 },
  photoPreview: { borderRadius: radii.lg, height: 180, width: '100%' },

  tyreCard: { gap: 12 },
  selectedTyreCard: { borderColor: colors.accentBorder, backgroundColor: colors.accentSoft },
  tyreTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  tyreBrand: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 17, lineHeight: 23 },
  tyrePattern: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 20 },
  priceStack: { alignItems: 'flex-end' },
  tyrePrice: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 18, lineHeight: 24 },
  tyreMetaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tyreMeta: { color: colors.subtle, fontFamily: typography.body, fontSize: 12, lineHeight: 16 },
  cartControls: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  cartAdded: { color: colors.accent, flexShrink: 1, fontFamily: typography.bodyMedium, fontSize: 14 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.72)', flex: 1, justifyContent: 'center', padding: 18 },
  modalCard: { gap: 12, width: '100%' },

  twoGrid: { gap: 10 },
  dateRow: { gap: 8, paddingRight: 6 },
  dateButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, justifyContent: 'center', minHeight: 64, minWidth: 64, paddingHorizontal: 10, paddingVertical: 8 },
  dateButtonSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  dateDay: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 12 },
  dateLabel: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 14 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flexBasis: '30%', flexGrow: 1, minHeight: 60, justifyContent: 'center', padding: 8 },
  slotButtonSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  disabledBlock: { opacity: 0.4 },
  slotTime: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 15, lineHeight: 20 },
  slotMeta: { color: colors.subtle, fontFamily: typography.body, fontSize: 11 },

  priceCard: { gap: 2 },
  totalValue: { color: colors.accent, fontFamily: typography.bodyBold, fontSize: 18, lineHeight: 24 },
  quoteMeta: { alignItems: 'center' },

  doneHero: { alignItems: 'center', gap: 10, paddingTop: 8 },
  doneTitle: { color: colors.text, fontFamily: typography.heading, fontSize: 26, lineHeight: 32, textAlign: 'center' },
  doneCard: { alignItems: 'center', gap: 8 },
  doneCheckBadge: { alignItems: 'center', backgroundColor: colors.successSoft, borderRadius: 36, height: 72, justifyContent: 'center', width: 72 },
  doneRefRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  doneRef: { color: colors.text, flexShrink: 1, fontFamily: typography.display, fontSize: 40, lineHeight: 44, letterSpacing: 1 },
  doneCopyButton: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: radii.md, flexDirection: 'row', gap: 6, minHeight: 40, paddingHorizontal: 12 },
  doneCopyText: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 13 },
  accountCard: { gap: 12 },
  accountHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  accountTitle: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 17 },
});
