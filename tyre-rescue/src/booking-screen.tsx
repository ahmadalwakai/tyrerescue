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
    <Text style={screenStyles.heroEyebrow}>Mobile tyre support</Text>
    <Text accessibilityRole="header" style={screenStyles.heroTitle}>How can we help?</Text>
    <Text style={screenStyles.heroDetail}>Get roadside help now or book a fitting that suits you.</Text>
  </View>;
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
  const index = getProgressIndex(steps, step);
  return <View style={screenStyles.progressCard}>
    <View style={screenStyles.progressHeading}>
      <Text style={screenStyles.progressTitle}>Stage {activeStage + 1} of 3</Text>
      <Text style={screenStyles.progressDetail}>{currentStepLabel(step)} · {index + 1} of {steps.length} steps</Text>
    </View>
    <View style={screenStyles.stageRow}>
      {BOOKING_STAGES.map((stage, stageIndex) => <View key={stage.title} accessible accessibilityLabel={
        'Stage ' + (stageIndex + 1) + ', ' + stage.title + (stageIndex === activeStage ? ', current' : '')
      } style={screenStyles.stageItem}>
        <View style={[screenStyles.stageTrack, stageIndex <= activeStage ? screenStyles.stageTrackActive : null]} />
        <Text style={[screenStyles.stageLabel, stageIndex === activeStage ? screenStyles.stageLabelActive : null]}>{stageIndex + 1}. {stage.title}</Text>
      </View>)}
    </View>
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
        <View style={screenStyles.topBar}>
          <View style={screenStyles.brand}><Logo compact animated={false} /><Text style={screenStyles.brandName}>TYRE RESCUE</Text></View>
          {step !== 'service' && step !== 'done' && !state.pendingPaymentIntentId && !state.paymentAttemptIntentId ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Previous booking step" disabled={navigationLocked} onPress={goPrev} style={screenStyles.backButton}>
              <Feather name="chevron-left" size={18} color={colors.text} />
            </Pressable>
          ) : null}
        </View>

        {draftRestored ? <InlineNotice>Your saved details have been restored. Prices and appointment availability will be checked again.</InlineNotice> : null}
        <StepProgress state={state} step={step} />

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
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail} ${meta}`} accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [screenStyles.serviceChoice, emergency ? screenStyles.emergencyChoice : null,
      selected ? screenStyles.serviceChoiceSelected : null, pressed ? screenStyles.choicePressed : null]}>
    <View style={screenStyles.serviceChoiceHeading}>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[screenStyles.serviceChoiceIcon, emergency ? screenStyles.emergencyChoiceIcon : null]}><Feather accessible={false} name={icon} size={24} color={colors.accent} /></View>
      <View style={screenStyles.serviceChoiceCopy}>
        <Text style={screenStyles.serviceChoiceTitle}>{title}</Text>
        <Text style={screenStyles.serviceChoiceDetail}>{detail}</Text>
      </View>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Feather accessible={false} name={selected ? 'check-circle' : 'chevron-right'} size={22} color={selected ? colors.accent : colors.muted} /></View>
    </View>
    <Text style={[screenStyles.serviceChoiceMeta, emergency ? screenStyles.emergencyChoiceMeta : null]}>{meta}</Text>
  </Pressable>;
}

function ServiceStep({ state, updateState, goNext }: StepProps) {
  const [availability, setAvailability] = useState<{ available: boolean; count: number } | null>(null);
  useEffect(() => {
    requestJson<{ available: boolean; count: number }>(API.driverAvailable)
      .then(setAvailability)
      .catch(() => setAvailability({ available: false, count: 0 }));
  }, []);
  return <View style={screenStyles.stepGap}>
    <CustomerActiveBookingCard />
    <ServiceHeroHeader />
    <ServiceChoice icon="zap" emergency title="Emergency tyre help" detail="Flat tyre or a breakdown? Start a callout at your location."
      meta={availability?.available ? 'Drivers available now' : availability ? 'Call to check availability' : 'Checking driver availability'}
      selected={state.bookingType === 'emergency'} onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        updateState({ ...quoteReset, bookingType: 'emergency',
          ...(state.fittingLocation === 'shop' ? { address: '', lat: null, lng: null, distanceMiles: null } : {}),
          fittingLocation: null, scheduledDate: null, scheduledTime: null });
      }} />
    <ServiceChoice icon="calendar" title="Book a fitting" detail="Choose a workshop visit or mobile fitting."
      meta="Pick a date and time" selected={state.bookingType === 'scheduled'} onPress={() => {
        if (state.bookingType === 'scheduled') return;
        void Haptics.selectionAsync().catch(() => {});
        updateState({ ...quoteReset, bookingType: 'scheduled', fittingLocation: state.fittingLocation ?? null });
      }} />
    {state.bookingType === 'scheduled' ? <CustomerFittingChoice state={state} updateState={updateState} /> : null}
    <BookingContinueButton icon="arrow-right" disabled={!state.bookingType || (state.bookingType === 'scheduled' && !state.fittingLocation)} onPress={goNext}>Continue</BookingContinueButton>
    <View style={screenStyles.homeSupport}>
      <Text style={screenStyles.supportTitle}>Need a hand?</Text>
      <PrimaryButton icon="phone" variant="secondary" onPress={() => Linking.openURL('tel:' + PHONE_TEL)}>Call {PHONE_DISPLAY}</PrimaryButton>
      <CustomerCallbackRequest name={state.customerName} phone={state.customerPhone} notes="Callback requested from the customer booking app." />
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
  const routeLineCoordinates = routeCoordinates;

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader eyebrow="Availability" title={result.driversOnline > 0 ? 'Emergency service available' : 'Confirm availability with our team'} detail={result.message} />
      {state.lat != null && state.lng != null ? (
        <PulsingMap
          markers={routeMarkers}
          routeCoordinates={routeLineCoordinates}
          style={screenStyles.mapImageTall}
        />
      ) : null}
      <Card style={screenStyles.etaCard}>
        <Text style={screenStyles.etaText}>{result.etaLabel || '1-2 hours'}</Text>
        <Text style={screenStyles.etaLabel}>Estimated arrival window, subject to dispatch</Text>
        {result.driverName ? <Text style={screenStyles.mutedCentered}>Nearest driver: {result.driverName}</Text> : null}
        <Text style={screenStyles.mutedCentered}>{result.driversOnline} driver{result.driversOnline === 1 ? '' : 's'} online</Text>
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

function conditionToProblemType(condition: ConditionAssessment | null): ProblemType | null {
  if (condition === 'repair') return 'puncture';
  if (condition === 'replacement') return 'damaged_tyre';
  if (condition === 'not_sure') return 'not_sure';
  return null;
}

function problemTitle(problemType: ProblemType | null) {
  return PROBLEM_OPTIONS.find((item) => item.value === problemType)?.title ?? 'Tyre problem';
}

function rimEstimate(size: BookingState['tyreSize']) {
  const rim = Number(size.rim);
  if (!Number.isFinite(rim) || rim <= 0) return { low: 85, high: 155 };
  if (rim <= 15) return { low: 70, high: 115 };
  if (rim <= 17) return { low: 85, high: 145 };
  if (rim <= 19) return { low: 115, high: 190 };
  return { low: 145, high: 240 };
}

function bookingExtrasEstimate(input: Pick<BookingState, 'bookingType' | 'fittingLocation' | 'lockingNutStatus'>) {
  let low = 0;
  let high = 0;
  if (input.bookingType === 'emergency') {
    low += 20;
    high += 45;
  }
  if (input.fittingLocation === 'mobile') {
    low += 15;
    high += 35;
  }
  if (input.lockingNutStatus === 'no_key') {
    low += 20;
    high += 55;
  }
  return { low, high };
}

function getPriceEstimate(input: BookingState) {
  const quantity = clampQuantity(input.quantity || 1);
  const extras = bookingExtrasEstimate(input);
  const isRepair = input.serviceType === 'repair' || input.conditionAssessment === 'repair';
  const isAssessment = input.serviceType === 'assess' || input.conditionAssessment === 'not_sure';

  if (input.selectedTyres.length > 0) {
    const tyreTotal = input.selectedTyres.reduce((sum, tyre) => sum + tyre.unitPrice * tyre.quantity, 0);
    const fitCount = input.selectedTyres.reduce((sum, tyre) => sum + tyre.quantity, 0);
    const fittingLow = fitCount * 18;
    const fittingHigh = fitCount * 34;
    return {
      low: tyreTotal + fittingLow + extras.low,
      high: tyreTotal + fittingHigh + extras.high,
      label: 'Tyres selected',
      detail: 'Estimate includes selected tyres plus fitting and location extras. Final quote appears before payment.',
    };
  }

  if (isRepair) {
    return {
      low: 45 + extras.low + (quantity - 1) * 18,
      high: 85 + extras.high + (quantity - 1) * 35,
      label: 'Repair estimate',
      detail: 'Final price depends on tyre condition, location, and whether repair is safe on arrival.',
    };
  }

  const tyre = rimEstimate(input.tyreSize);
  const baseLow = isAssessment ? 45 + tyre.low * 0.65 : tyre.low;
  const baseHigh = isAssessment ? 80 + tyre.high : tyre.high;

  return {
    low: baseLow * quantity + extras.low,
    high: baseHigh * quantity + extras.high,
    label: isAssessment ? 'Assessment estimate' : 'Replacement estimate',
    detail: 'Range is based on tyre size, quantity, appointment type, and common fitting costs.',
  };
}

function PriceEstimateCard({ state }: { state: BookingState }) {
  if (!state.bookingType || !state.conditionAssessment) return null;

  const estimate = getPriceEstimate(state);

  return (
    <Card style={screenStyles.estimateCard}>
      <View style={screenStyles.estimateHeader}>
        <View style={screenStyles.estimateIcon}>
          <Feather name="tag" size={18} color={colors.accent} />
        </View>
        <View style={screenStyles.flex}>
          <Text style={screenStyles.estimateLabel}>{estimate.label}</Text>
          <Text style={screenStyles.estimateRange}>
            {formatPrice(estimate.low)} - {formatPrice(estimate.high)}
          </Text>
        </View>
      </View>
      <Text style={screenStyles.estimateDetail}>{estimate.detail}</Text>
    </Card>
  );
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
        <Feather accessible={false} name={option.icon} size={24} color={selected ? colors.accent : colors.text} />
      </View>
      <View style={screenStyles.problemCopy}>
        <Text style={[screenStyles.problemTitle, selected ? screenStyles.problemTitleSelected : null]}>
          {option.title}
        </Text>
        <Text style={screenStyles.problemDetail}>{option.detail}</Text>
      </View>
      <Pill tone={selected ? 'accent' : 'neutral'}>{option.meta}</Pill>
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

  const photoRequest = useRef(0);
  const photoMounted = useRef(true);
  const photoUploadController = useRef<AbortController | null>(null);
  const [unknownSize, setUnknownSize] = useState(false);
  useEffect(() => { photoMounted.current = true; return () => { photoMounted.current = false; photoUploadController.current?.abort(); if (searchTimer.current) clearTimeout(searchTimer.current); }; }, []);
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
  const draftEstimateState: BookingState = {
    ...state,
    tyreSize: { width, aspect, rim },
    problemType,
    conditionAssessment: condition,
    serviceType: condition === 'repair' ? 'repair' : condition === 'replacement' ? 'fit' : condition ? 'assess' : state.serviceType,
    quantity: clampQuantity(quantity),
    lockingNutStatus: lockingNut,
  };

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader eyebrow="Tyre details" title="Tell us about the tyre" detail="Add your vehicle and tyre details. A photo helps our technician prepare." />

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

      <Section title="Problem">
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
        <LockingNutPriceNotice status={lockingNut} />
      </Section>

      <Section title="Photo">
        {photoUrl ? <Image source={{ uri: photoUrl }} style={screenStyles.photoPreview} /> : null}
        <PrimaryButton icon="image" variant="secondary" loading={uploading} onPress={() => { void pickPhoto(false); }}>
          {photoUrl ? 'Replace photo' : 'Choose tyre photo'}
        </PrimaryButton>
        {Platform.OS !== 'web' ? <PrimaryButton icon="camera" variant="secondary" disabled={uploading} onPress={() => { void pickPhoto(true); }}>Take a photo</PrimaryButton> : null}
        {photoUrl ? <><InlineNotice tone="success">Photo uploaded and attached to your booking.</InlineNotice><PrimaryButton variant="ghost" disabled={uploading} onPress={() => { setPhotoUrl(null); updateState({ tyrePhotoUrl: null }); }}>Remove photo</PrimaryButton></> : null}
        <PrimaryButton variant="ghost" disabled={uploading} onPress={() => setUnknownSize(value => !value)}>{unknownSize ? 'Use a confirmed tyre size instead' : 'I do not know my tyre size'}</PrimaryButton>
        {unknownSize ? <CustomerAssistedHelpRequest name={state.customerName} phone={state.customerPhone} details={{ address: state.address, lat: state.lat ?? NaN, lng: state.lng ?? NaN, vehicleReg, vehicleMake, vehicleModel, photoUrl: photoUrl || undefined }} /> : null}
      </Section>

      <PriceEstimateCard state={draftEstimateState} />

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
        </Card>
      ) : null}

      <PriceEstimateCard state={state} />

      <BookingContinueButton icon="arrow-right" disabled={state.selectedTyres.length === 0} onPress={goNext}>
        Continue
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
      <ScreenHeader eyebrow="Schedule" title="Choose date and time" detail="All appointments are shown in UK time (Europe/London)." />

      <Section title="Fitting location">
        {state.fittingLocation ? <><Row label="Where" value={state.fittingLocation === 'shop' ? `At the workshop: ${state.address}` : 'At your location'} /><PrimaryButton variant="ghost" onPress={() => goTo('service')}>Change fitting location</PrimaryButton></> :
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

      <PriceEstimateCard state={{ ...state, fittingLocation }} />

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
      {!state.breakdown ? <ScreenHeader eyebrow="Review" title="Your booking and price" detail="Check your service, price and contact details together before payment." /> : null}
      {error ? (
        <>
          <InlineNotice tone="danger">{error}</InlineNotice>
          <PrimaryButton icon="refresh-cw" disabled={creatingBooking} onPress={requestQuote}>Retry</PrimaryButton>
          <CustomerCallbackRequest name={state.customerName} phone={state.customerPhone} notes={['Help with a booking quote.', state.vehicleReg, state.address, state.tyrePhotoUrl || ''].filter(Boolean).join(' ')} />
        </>
      ) : null}
      {state.breakdown ? (
        <>
          {expired ? <InlineNotice>Your quote has expired. Refresh the price to continue; your details will be kept.</InlineNotice> : <Text style={screenStyles.mutedCentered}>Price valid until {new Date(state.quoteExpiresAt!).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })} UK time.</Text>}
          <CustomerStep {...props} quoteReady={total > 0 && !loading && !error && !expired}
            canSubmit={() => !quoteRequestPending.current}
            setNavigationLocked={(locked) => { bookingCreationLocked.current = locked; setCreatingBooking(locked); props.setNavigationLocked?.(locked); }} />
          <PrimaryButton icon="refresh-cw" variant="ghost" loading={loading} disabled={creatingBooking} onPress={requestQuote}>
            Refresh quote
          </PrimaryButton>
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

  return (
    <View style={screenStyles.stepGap}>
      <ScreenHeader eyebrow="Review" title="Review & confirm booking" detail="Check the location, service and total. Your card is charged only when you complete secure payment." />
      {state.breakdown ? (
        <Card>
          <Row label="Service" value={state.serviceType === 'repair' ? 'Puncture repair' : state.serviceType === 'assess' ? 'Assessment' : 'Tyre fitting'} />
          <Row label="Problem" value={problemTitle(state.problemType)} />
          <Row label="Location" value={state.address} />
          <Row label={state.bookingType === 'scheduled' ? 'Appointment (UK time)' : 'Estimated arrival'} value={state.bookingType === 'scheduled' ? `${state.scheduledDate} ${state.scheduledTime}` : state.emergencyEtaLabel || 'Our team will confirm availability'} />
          <PrimaryButton variant="ghost" disabled={loading} onPress={() => goTo(state.fittingLocation === 'shop' ? 'service' : 'location')}>Edit location</PrimaryButton>
          <Row label="Vehicle" value={[state.vehicleReg, state.vehicleMake, state.vehicleModel].filter(Boolean).join(' ') || 'Not specified'} />
          <Row label="Tyre size" value={tyreSizeDisplay(state.tyreSize)} />
          <Row label="Quantity" value={String(state.quantity)} />
          {state.selectedTyres.map((tyre) => <Row key={tyre.tyreId} label={`${tyre.quantity}x ${tyre.brand} ${tyre.pattern}`} value={tyre.sizeDisplay} />)}
          <PrimaryButton variant="ghost" disabled={loading} onPress={() => goTo('details')}>Edit vehicle or tyres</PrimaryButton>
          {state.tyrePhotoUrl ? <Image accessibilityLabel="Attached tyre photo" source={{ uri: state.tyrePhotoUrl }} style={screenStyles.photoPreview} /> : null}
          {(state.breakdown.lineItems || []).map((item, index) => <Row key={`${item.type}-${index}`} label={item.label} value={formatPrice(item.amount)} />)}
          <Row label="Subtotal" value={formatPrice(state.breakdown.subtotal)} />
          <Row label="VAT" value={formatPrice(state.breakdown.vatAmount)} />
          <Row label="Total to pay" value={formatPrice(state.breakdown.total)} valueStyle={{ color: colors.accent }} />
        </Card>
      ) : null}
      <TextField label="Full name" value={name} onChangeText={value => { setName(value); updateState({ customerName: value }); }} placeholder="John Smith" autoComplete="name" />
      <TextField label="Email" value={email} onChangeText={value => { setEmail(value); updateState({ customerEmail: value }); }} placeholder="john@example.com" keyboardType="email-address" autoComplete="email" />
      <TextField label="Phone" value={phone} onChangeText={value => { setPhone(value); updateState({ customerPhone: value }); }} placeholder="07123 456789" keyboardType="phone-pad" autoComplete="tel" />
      <LockingNutPriceNotice status={state.lockingNutStatus} />
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {quoteNeedsRestart ? (
        <BookingContinueButton icon="refresh-cw" onPress={() => { updateState({ ...quoteReset, customerName: name, customerEmail: email, customerPhone: phone }); goTo('quote'); }}>
          Refresh price and keep my details
        </BookingContinueButton>
      ) : (
        <BookingContinueButton icon="credit-card" loading={loading} disabled={!quoteReady} onPress={submit}>
          Confirm details & continue to payment
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
      <ScreenHeader eyebrow="Payment" title="Secure payment" detail="Your payment is handled securely by Stripe." />
      <Card>
        <Row label="Reference" value={state.refNumber || '-'} />
        <Row label="Total" value={amountLabel} valueStyle={{ color: colors.accent }} />
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
      <ScreenHeader eyebrow="Confirmed" title="Booking received" detail={`${BUSINESS_NAME} has your booking reference.`} />
      <View style={screenStyles.doneCardMotion}>
        <Card style={screenStyles.doneCard}>
          <View style={screenStyles.doneCheckBadge}>
            <Feather name="check-circle" size={38} color={colors.success} />
          </View>
          <View style={screenStyles.doneRefRow}>
            <Text style={screenStyles.doneRef}>{refNumber || '-'}</Text>
            {refNumber ? (
              <View>
                <Pressable accessibilityLabel="Copy booking reference" accessibilityRole="button" onPress={copyReference} style={screenStyles.doneCopyButton}>
                  <Feather name={referenceCopied ? 'check' : 'copy'} size={16} color={referenceCopied ? colors.success : colors.text} />
                  <Text style={screenStyles.doneCopyText}>{referenceCopied ? 'Copied' : 'Copy'}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          <Text style={screenStyles.mutedCentered}>
            Confirmation email and SMS will be sent after payment confirmation.
          </Text>
        </Card>
      </View>
      {state.refNumber && state.invoiceDownloadToken ? (
        <PrimaryButton
          icon="download"
          variant="secondary"
          onPress={() => Linking.openURL(customerInvoiceUrl(state.refNumber!, state.invoiceDownloadToken!))}
        >
          Download invoice
        </PrimaryButton>
      ) : null}
      <PrimaryButton icon="message-circle" variant="secondary" onPress={() => router.push({ pathname: '/chat', params: { bookingId: state.bookingId || '', refNumber, bookingAccessToken: state.bookingAccessToken || '' } })}>Chat with our team</PrimaryButton>
      <PrimaryButton icon="map-pin" onPress={() => router.push({ pathname: '/track', params: { ref: refNumber, accessToken: state.bookingAccessToken || '' } })}>Track my booking</PrimaryButton>
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

const quoteReset = resetBookingQuote;

const screenStyles = StyleSheet.create({
  root: {
    backgroundColor: colors.bg,
    flex: 1,
    overflow: 'hidden',
  },
  scroll: { flex: 1 },
  content: { gap: 16, padding: spacing.page, paddingBottom: 24 },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12, minHeight: 42 },
  brand: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 10 },
  brandName: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 15, flexShrink: 1 },
  backButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  stepGap: { gap: 14 },
  heroHeader: { alignSelf: 'stretch', gap: 6, marginBottom: 2 },
  heroEyebrow: { color: colors.accent, fontFamily: typography.bodyMedium, fontSize: 12 },
  heroTitle: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 28, lineHeight: 36, flexShrink: 1 },
  heroDetail: { color: colors.muted, fontFamily: typography.body, fontSize: 15, lineHeight: 22, flexShrink: 1 },
  stepMotion: { alignSelf: 'stretch' },
  serviceChoice: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  emergencyChoice: { backgroundColor: '#231A14', borderColor: '#B75B26' },
  serviceChoiceSelected: { borderColor: colors.accent, backgroundColor: '#2B211B' },
  choicePressed: { opacity: 0.84 },
  serviceChoiceHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  serviceChoiceIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, flexShrink: 0 },
  emergencyChoiceIcon: { backgroundColor: 'rgba(249,115,22,0.16)' },
  serviceChoiceCopy: { flex: 1, minWidth: 0, gap: 5 },
  serviceChoiceTitle: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 20, lineHeight: 27, flexShrink: 1 },
  serviceChoiceDetail: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  serviceChoiceMeta: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 12, lineHeight: 18 },
  emergencyChoiceMeta: { color: '#FDBA74' },
  homeSupport: { gap: 10, marginTop: 4 },
  supportTitle: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 13 },
  progressCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 12 },
  progressHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  progressTitle: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 14 },
  progressDetail: { color: colors.muted, fontFamily: typography.body, fontSize: 12 },
  stageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stageItem: { flexBasis: 90, flexGrow: 1, flexShrink: 1, gap: 6 },
  stageTrack: { height: 4, borderRadius: 4, backgroundColor: colors.border },
  stageTrackActive: { backgroundColor: colors.accent },
  stageLabel: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 12, lineHeight: 18 },
  stageLabelActive: { color: colors.text },
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
  problemGrid: {
    gap: 10,
  },
  problemCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 104,
    padding: 14,
  },
  problemCardSelected: {
    backgroundColor: 'rgba(249,115,22,0.1)',
    borderColor: 'rgba(249,115,22,0.72)',
    borderWidth: 2,
  },
  problemCardPressed: {
    opacity: 0.86,
  },
  problemIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  problemIconSelected: {
    backgroundColor: 'rgba(249,115,22,0.16)',
    borderColor: 'rgba(249,115,22,0.42)',
  },
  problemCopy: {
    flex: 1,
    gap: 4,
  },
  problemTitle: {
    color: colors.text,
    flexShrink: 1,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    lineHeight: 20,
  },
  problemTitleSelected: {
    color: colors.accent,
  },
  problemDetail: {
    color: colors.muted,
    flexShrink: 1,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17,
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
  estimateCard: {
    backgroundColor: '#202024',
    gap: 10,
  },
  estimateHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  estimateIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(249,115,22,0.12)',
    borderColor: 'rgba(249,115,22,0.34)',
    borderRadius: radii.md,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  estimateLabel: {
    color: colors.muted,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  estimateRange: {
    color: colors.accent,
    flexShrink: 1,
    fontFamily: typography.display,
    fontSize: 34,
    lineHeight: 36,
  },
  estimateDetail: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
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
  doneCardMotion: {
    alignSelf: 'stretch',
  },
  doneCheckBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.35)',
    borderRadius: 29,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  doneRefRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  doneRef: {
    color: colors.accent,
    flexShrink: 1,
    fontFamily: typography.display,
    fontSize: 46,
    lineHeight: 48,
  },
  doneCopyButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
  },
  doneCopyText: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 13,
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
