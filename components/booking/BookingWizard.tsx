'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  VStack,
  HStack,
  Text,
  Skeleton,
} from '@chakra-ui/react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  WizardState,
  WizardStep,
  initialWizardState,
  getStepsForBookingType,
  type StepConfig,
} from './types';
import { StepServiceType } from './StepServiceType';
import { StepLocation } from './StepLocation';
import { StepEligibility } from './StepEligibility';
import { StepTyreDetails } from './StepTyreDetails';
import { StepTyreSelection } from './StepTyreSelection';
import { StepSchedule } from './StepSchedule';
import { StepPricing } from './StepPricing';
import { StepCustomerDetails } from './StepCustomerDetails';
import { StepPayment } from './StepPayment';
import { QuoteLoadingScreen } from './QuoteLoadingScreen';
import { colorTokens as c } from '@/lib/design-tokens';

// ── Draft persistence ────────────────────────────────────
// localStorage key for durable cross-session persistence.
// Schema is versioned so stale drafts are safely discarded.
export const BOOKING_DRAFT_KEY = 'tyrerescue_booking_draft';
const DRAFT_VERSION = 1;

/** Fields that must NEVER be persisted (secrets, transient IDs) */
const SENSITIVE_KEYS: (keyof WizardState)[] = [
  'stripeClientSecret',
];

interface DraftEnvelope {
  version: number;
  state: WizardState;
  currentStep: WizardStep;
  updatedAt: number; // epoch ms
}

function saveDraft(state: WizardState, currentStep: WizardStep) {
  try {
    const safe = { ...state };
    for (const key of SENSITIVE_KEYS) {
      (safe as Record<string, unknown>)[key] = null;
    }
    const envelope: DraftEnvelope = {
      version: DRAFT_VERSION,
      state: safe,
      currentStep,
      updatedAt: Date.now(),
    };
    localStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(envelope));
  } catch {
    // Storage full or unavailable — non-fatal
  }
}

function loadDraft(): DraftEnvelope | null {
  try {
    const raw = localStorage.getItem(BOOKING_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope;
    if (parsed.version !== DRAFT_VERSION) {
      localStorage.removeItem(BOOKING_DRAFT_KEY);
      return null;
    }
    // Discard drafts older than 24 hours
    if (Date.now() - parsed.updatedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(BOOKING_DRAFT_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(BOOKING_DRAFT_KEY);
    return null;
  }
}

export function clearBookingDraft() {
  try { localStorage.removeItem(BOOKING_DRAFT_KEY); } catch { /* noop */ }
  try { sessionStorage.removeItem('tyrerescue_booking_wizard'); } catch { /* noop */ }
}

// ── Step Indicator ───────────────────────────────────────

interface StepIndicatorProps {
  steps: StepConfig[];
  currentStep: WizardStep;
}

function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  const currentIndex = steps.findIndex(s => s.key === currentStep);
  const progress = steps.length > 1 ? (currentIndex / (steps.length - 1)) * 100 : 0;

  return (
    <Box
      bg={c.surface}
      borderRadius="md"
      p={4}
      mb={6}
      borderWidth="1px"
      borderColor={c.border}
      role="navigation"
      aria-label="Booking progress"
    >
      {/* Animated progress bar */}
      <Box
        h="2px"
        bg={c.border}
        borderRadius="full"
        mb={4}
        overflow="hidden"
        position="relative"
      >
        <Box
          h="full"
          bg={c.accent}
          borderRadius="full"
          style={{
            width: `${progress}%`,
            transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)',
          }}
        />
      </Box>

      <HStack gap={0} justify="space-between" wrap="wrap">
        {steps.map((step, index) => {
          const isActive = step.key === currentStep;
          const isCompleted = index < currentIndex;

          return (
            <Box
              key={step.key}
              flex="1"
              minW="80px"
              textAlign="center"
              position="relative"
            >
              {/* Step number — always 1-based from resolved flow */}
              <Box
                position="relative"
                zIndex={1}
                w="24px"
                h="24px"
                borderRadius="full"
                bg={isActive ? c.accent : isCompleted ? c.accent : c.border}
                color={c.bg}
                fontSize="xs"
                fontWeight="600"
                display="flex"
                alignItems="center"
                justifyContent="center"
                mx="auto"
                mb={1}
                aria-current={isActive ? 'step' : undefined}
                style={{
                  transition: 'background 0.3s ease, transform 0.3s ease',
                  transform: isActive ? 'scale(1.15)' : 'scale(1)',
                  animation: isActive ? 'indicatorPulse 2s ease-in-out infinite' : undefined,
                }}
              >
                {isCompleted ? '\u2713' : step.number}
              </Box>

              {/* Step name */}
              <Text
                fontSize="xs"
                fontWeight={isActive ? '600' : '400'}
                color={isActive ? c.accent : isCompleted ? c.text : c.muted}
                whiteSpace="nowrap"
                style={{ transition: 'color 0.3s ease' }}
              >
                {step.name}
              </Text>
            </Box>
          );
        })}
      </HStack>
    </Box>
  );
}

// ── Booking Wizard ───────────────────────────────────────

export interface BookingWizardProps {
  initialStep?: WizardStep;
  initialState?: Partial<WizardState>;
}

export function BookingWizard({ initialStep, initialState }: BookingWizardProps) {
  const router = useRouter();
  const [state, setState] = useState<WizardState>({ ...initialWizardState, ...initialState });
  const [currentStep, setCurrentStep] = useState<WizardStep>(initialStep || 'service-type');
  const [isHydrated, setIsHydrated] = useState(false);
  const [showQuoteLoader, setShowQuoteLoader] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const quoteLoaderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore state from localStorage on mount (fall back to sessionStorage for migration)
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setState({ ...initialWizardState, ...draft.state });
      if (!initialStep && draft.currentStep) {
        setCurrentStep(draft.currentStep);
      }
    } else {
      // One-time migration: check old sessionStorage key
      try {
        const old = sessionStorage.getItem('tyrerescue_booking_wizard');
        if (old) {
          const parsed = JSON.parse(old);
          if (parsed.state) setState({ ...initialWizardState, ...parsed.state });
          if (!initialStep && parsed.currentStep) setCurrentStep(parsed.currentStep);
          sessionStorage.removeItem('tyrerescue_booking_wizard');
        }
      } catch { /* ignore */ }
    }
    setIsHydrated(true);
  }, [initialStep]);

  // Debounced save to localStorage (300ms)
  useEffect(() => {
    if (!isHydrated) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      saveDraft(state, currentStep);
    }, 300);
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, [state, currentStep, isHydrated]);

  const updateState = useCallback((updates: Partial<WizardState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const goToStep = useCallback((step: WizardStep) => {
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goToNext = useCallback(() => {
    const steps = getStepsForBookingType(state.bookingType, state.serviceType);
    const currentIndex = steps.findIndex(s => s.key === currentStep);
    if (currentIndex < steps.length - 1) {
      const nextStep = steps[currentIndex + 1].key;
      if (nextStep === 'pricing') {
        setShowQuoteLoader(true);
        return;
      }
      goToStep(nextStep);
    }
  }, [state.bookingType, state.serviceType, currentStep, goToStep]);

  const goToPrev = useCallback(() => {
    const steps = getStepsForBookingType(state.bookingType, state.serviceType);
    const currentIndex = steps.findIndex(s => s.key === currentStep);
    if (currentIndex > 0) {
      goToStep(steps[currentIndex - 1].key);
    }
  }, [state.bookingType, state.serviceType, currentStep, goToStep]);

  const resetWizard = useCallback(() => {
    setState(initialWizardState);
    setCurrentStep('service-type');
    clearBookingDraft();
    setShowResetConfirm(false);
  }, []);

  const handleStartOverClick = useCallback(() => {
    // If the user has progressed past service-type, confirm first
    if (currentStep !== 'service-type') {
      setShowResetConfirm(true);
    } else {
      resetWizard();
    }
  }, [currentStep, resetWizard]);

  const handlePaymentSuccess = useCallback((refNumber: string) => {
    clearBookingDraft();
    router.push(`/success/${refNumber}`);
  }, [router]);

  const handlePaymentError = useCallback((error: string) => {
    // Stay on payment step to allow retry
  }, []);

  const handleQuoteLoaderComplete = useCallback(() => {
    setShowQuoteLoader(false);
    goToStep('pricing');
  }, [goToStep]);

  // Don't render until hydrated to prevent mismatch
  if (!isHydrated) {
    return (
      <Container maxW="container.md" py={8}>
        <VStack gap={6} align="stretch">
          <Skeleton h="60px" borderRadius="md" />
          <Skeleton h="300px" borderRadius="lg" />
          <Skeleton h="20px" w="120px" mx="auto" borderRadius="sm" />
        </VStack>
      </Container>
    );
  }

  const steps = getStepsForBookingType(state.bookingType, state.serviceType);

  const renderStep = () => {
    switch (currentStep) {
      case 'service-type':
        return (
          <StepServiceType
            state={state}
            updateState={updateState}
            goToNext={goToNext}
          />
        );

      case 'location':
        return (
          <StepLocation
            state={state}
            updateState={updateState}
            goToNext={goToNext}
            goToPrev={goToPrev}
          />
        );

      case 'eligibility':
        return (
          <StepEligibility
            state={state}
            updateState={updateState}
            goToNext={goToNext}
            goToPrev={goToPrev}
          />
        );

      case 'tyre-details':
        return (
          <StepTyreDetails
            state={state}
            updateState={updateState}
            goToNext={goToNext}
            goToPrev={goToPrev}
          />
        );

      case 'tyre-selection':
        return (
          <StepTyreSelection
            state={state}
            updateState={updateState}
            goToNext={goToNext}
            goToPrev={goToPrev}
          />
        );

      case 'schedule':
        return (
          <StepSchedule
            state={state}
            updateState={updateState}
            goToNext={goToNext}
            goToPrev={goToPrev}
          />
        );

      case 'pricing':
        return (
          <StepPricing
            state={state}
            updateState={updateState}
            goToNext={goToNext}
            goToPrev={goToPrev}
            goToStep={goToStep}
          />
        );

      case 'customer-details':
        return (
          <StepCustomerDetails
            state={state}
            updateState={updateState}
            goToNext={goToNext}
            goToPrev={goToPrev}
          />
        );

      case 'payment':
        if (!state.stripeClientSecret || !state.bookingId || !state.refNumber || !state.breakdown) {
          return (
            <Box textAlign="center" py={8}>
              <Text color="red.400">
                Missing payment information. Please go back and try again.
              </Text>
            </Box>
          );
        }
        return (
          <StepPayment
            clientSecret={state.stripeClientSecret}
            bookingId={state.bookingId}
            refNumber={state.refNumber}
            breakdown={state.breakdown}
            selectedTyres={state.selectedTyres}
            onSuccess={handlePaymentSuccess}
            onError={handlePaymentError}
          />
        );

      default:
        return null;
    }
  };

  return (
    <ErrorBoundary>
      {/* Service type step renders full-viewport, outside the card wrapper */}
      {currentStep === 'service-type' && renderStep()}

      {currentStep !== 'service-type' && (
        <Container maxW="container.md" py={8}>
          <VStack gap={6} align="stretch">
            {/* Only show step indicator after service type is selected */}
            {state.bookingType && (
              <StepIndicator steps={steps} currentStep={currentStep} />
            )}

            {/* Current step content */}
            <Box
              key={currentStep}
              bg={c.card}
              borderRadius="lg"
              p={{ base: 4, md: 6 }}
              borderWidth="1px"
              borderColor={c.border}
              aria-live="polite"
              style={{ animation: 'stepEnter 0.4s cubic-bezier(0.16,1,0.3,1) both' }}
            >
              {renderStep()}
            </Box>

            {/* Reset link with confirmation */}
            {currentStep !== 'payment' && (
              <>
                {showResetConfirm ? (
                  <HStack justify="center" gap={3}>
                    <Text fontSize="sm" color={c.muted}>
                      Discard your progress?
                    </Text>
                    <Text
                      as="button"
                      fontSize="sm"
                      color="red.400"
                      cursor="pointer"
                      fontWeight="600"
                      bg="transparent"
                      border="none"
                      _hover={{ textDecoration: 'underline' }}
                      onClick={resetWizard}
                    >
                      Yes, start over
                    </Text>
                    <Text
                      as="button"
                      fontSize="sm"
                      color={c.accent}
                      cursor="pointer"
                      fontWeight="600"
                      bg="transparent"
                      border="none"
                      _hover={{ textDecoration: 'underline' }}
                      onClick={() => setShowResetConfirm(false)}
                    >
                      Cancel
                    </Text>
                  </HStack>
                ) : (
                  <Text
                    fontSize="sm"
                    color={c.muted}
                    textAlign="center"
                    cursor="pointer"
                    _hover={{ color: c.text }}
                    onClick={handleStartOverClick}
                  >
                    Start over
                  </Text>
                )}
              </>
            )}
          </VStack>
        </Container>
      )}

      <QuoteLoadingScreen
        isVisible={showQuoteLoader}
        onComplete={handleQuoteLoaderComplete}
        bookingType={state.bookingType || 'scheduled'}
      />
    </ErrorBoundary>
  );
}
