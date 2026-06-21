'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Box,
  Container,
  Flex,
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
import { trackBookingStart, trackCallClick } from '@/lib/analytics/gtag';

// ── Draft persistence ────────────────────────────────────
// localStorage key for durable cross-session persistence.
// Schema is versioned so stale drafts are safely discarded.
export const BOOKING_DRAFT_KEY = 'tyrerescue_booking_draft';
const DRAFT_VERSION = 1;

/** Fields that must NEVER be persisted (secrets, transient IDs) */
const SENSITIVE_KEYS: (keyof WizardState)[] = [
  'stripeClientSecret',
];

const bookingNavLinks = [
  { label: 'Home', href: '/' },
  { label: 'Emergency', href: '/emergency' },
  { label: 'Track', href: '/tracking' },
  { label: 'Tyres', href: '/tyres' },
  { label: 'Contact', href: '/contact' },
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

interface BookingTopBarProps {
  onBack: () => void;
}

function HeaderIcon({ name }: { name: 'back' | 'menu' | 'close' | 'phone' }) {
  const paths = {
    back: <path d="M15 18L9 12L15 6M10 12H21" />,
    menu: <path d="M4 7H20M4 12H20M4 17H20" />,
    close: <path d="M6 6L18 18M18 6L6 18" />,
    phone: <path d="M8.5 5.5L10.5 9.5L8.6 10.8C9.6 12.9 11.1 14.4 13.2 15.4L14.5 13.5L18.5 15.5V18.5C18.5 19.3 17.8 20 17 20C9.8 20 4 14.2 4 7C4 6.2 4.7 5.5 5.5 5.5H8.5Z" />,
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: 18, height: 18, flex: '0 0 auto' }}
    >
      {paths[name]}
    </svg>
  );
}

function BookingTopBar({ onBack }: BookingTopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  return (
    <Box
      as="header"
      position="sticky"
      top={0}
      zIndex={60}
      bg="rgba(9,9,11,0.94)"
      backdropFilter="blur(18px)"
      borderBottomWidth="1px"
      borderColor={c.border}
    >
      <Container maxW="7xl" px={{ base: 3, sm: 4, md: 6 }}>
        <Flex h="68px" align="center" justify="space-between" gap={3}>
          <HStack gap={3} minW={0}>
            <Box
              as="button"
              onClick={onBack}
              aria-label="Go back"
              color={c.text}
              bg={c.surface}
              border={`1px solid ${c.border}`}
              borderRadius="6px"
              h="40px"
              px={3}
              fontSize="14px"
              fontWeight="600"
              cursor="pointer"
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              gap={2}
              _hover={{ borderColor: c.accent, color: c.accent }}
            >
              <HeaderIcon name="back" />
              <Text as="span">Back</Text>
            </Box>
            <Link href="/" aria-label="Tyre Rescue home" style={{ display: 'inline-flex', alignItems: 'center' }}>
              <img
                src="/logo.svg"
                alt="Tyre Rescue"
                style={{ height: 'clamp(28px, 8vw, 42px)', width: 'auto', objectFit: 'contain' }}
              />
            </Link>
          </HStack>

          <HStack as="nav" aria-label="Booking navigation" gap={6} display={{ base: 'none', md: 'flex' }}>
            {bookingNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  color: link.href === '/book' ? c.accent : c.muted,
                  fontSize: 13,
                  textDecoration: 'none',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {link.label}
              </Link>
            ))}
          </HStack>

          <HStack gap={2}>
            <Box display={{ base: 'none', lg: 'block' }}>
              <a
                href="tel:01412660690"
                onClick={() => trackCallClick('booking_topbar_desktop')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 40,
                  padding: '0 14px',
                  borderRadius: 6,
                  background: c.accent,
                  color: c.bg,
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: 'none',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <HeaderIcon name="phone" />
                0141 266 0690
              </a>
            </Box>
            <Box
              as="button"
              display={{ base: 'inline-flex', md: 'none' }}
              alignItems="center"
              justifyContent="center"
              gap={2}
              h="40px"
              px={3}
              color={c.text}
              bg={c.surface}
              border={`1px solid ${c.border}`}
              borderRadius="6px"
              fontSize="13px"
              fontWeight="700"
              letterSpacing="0.04em"
              cursor="pointer"
              aria-expanded={menuOpen}
              aria-controls="booking-mobile-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <HeaderIcon name={menuOpen ? 'close' : 'menu'} />
              {menuOpen ? 'Close' : 'Menu'}
            </Box>
          </HStack>
        </Flex>
      </Container>

      {menuOpen && (
        <Box
          id="booking-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Booking menu"
          display={{ base: 'block', md: 'none' }}
          position="fixed"
          top="68px"
          left={0}
          right={0}
          minH="calc(100vh - 68px)"
          borderTopWidth="1px"
          borderColor={c.border}
          bg="rgba(9,9,11,0.98)"
          backdropFilter="blur(18px)"
        >
          <Container maxW="7xl" px={{ base: 4, sm: 6 }} py={6}>
            <VStack align="stretch" gap={1}>
              {bookingNavLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    color: c.text,
                    textDecoration: 'none',
                    padding: '14px 4px',
                    fontSize: 28,
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {link.label}
                </Link>
              ))}
              <a
                href="tel:01412660690"
                onClick={() => trackCallClick('booking_topbar_mobile')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  minHeight: 48,
                  marginTop: 18,
                  borderRadius: 6,
                  background: c.accent,
                  color: c.bg,
                  fontSize: 16,
                  fontWeight: 800,
                  textDecoration: 'none',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <HeaderIcon name="phone" />
                0141 266 0690
              </a>
            </VStack>
          </Container>
        </Box>
      )}
    </Box>
  );
}

// ── Booking Wizard ───────────────────────────────────────

export interface BookingWizardProps {
  initialStep?: WizardStep;
  initialState?: Partial<WizardState>;
  resumeDraft?: boolean;
}

export function BookingWizard({ initialStep, initialState, resumeDraft = true }: BookingWizardProps) {
  const router = useRouter();
  const [state, setState] = useState<WizardState>({ ...initialWizardState, ...initialState });
  const [currentStep, setCurrentStep] = useState<WizardStep>(initialStep || 'service-type');
  const [isHydrated, setIsHydrated] = useState(false);
  const [showQuoteLoader, setShowQuoteLoader] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const quoteLoaderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable ref so the hydration effect runs only on mount
  const initialStateRef = useRef(initialState);
  const resumeDraftRef = useRef(resumeDraft);

  // Restore state from localStorage on mount (fall back to sessionStorage for migration)
  useEffect(() => {
    const entry = initialStateRef.current;
    const shouldResumeDraft = resumeDraftRef.current;
    const draft = shouldResumeDraft ? loadDraft() : null;
    if (draft) {
      // If the caller passed explicit initialState (e.g. bookingType), those
      // fields take priority over the stale draft so that entry intent is
      // never hijacked by an old session.
      const merged = { ...initialWizardState, ...draft.state, ...entry };
      setState(merged);

      // Only restore the draft's currentStep when:
      // 1. No explicit initialStep was given by the page, AND
      // 2. The draft's booking intent is compatible with this entry:
      //    - If the page declared a bookingType → draft must match it
      //    - If no bookingType declared (e.g. /book) → draft must NOT be
      //      emergency (prevents stale emergency sessions from hijacking
      //      the scheduled entry).
      const draftTypeMatchesEntry = entry?.bookingType
        ? draft.state.bookingType === entry.bookingType
        : draft.state.bookingType !== 'emergency';

      if (!initialStep && draft.currentStep && draftTypeMatchesEntry) {
        setCurrentStep(draft.currentStep);
      }
    } else if (shouldResumeDraft) {
      // One-time migration: check old sessionStorage key
      try {
        const old = sessionStorage.getItem('tyrerescue_booking_wizard');
        if (old) {
          const parsed = JSON.parse(old);
          if (parsed.state) setState({ ...initialWizardState, ...parsed.state, ...entry });
          if (!initialStep && parsed.currentStep) setCurrentStep(parsed.currentStep);
          sessionStorage.removeItem('tyrerescue_booking_wizard');
        }
      } catch { /* ignore */ }
    }
    setIsHydrated(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (currentStep === 'service-type') trackBookingStart();
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

  const handleTopBarBack = useCallback(() => {
    const steps = getStepsForBookingType(state.bookingType, state.serviceType);
    const currentIndex = steps.findIndex(s => s.key === currentStep);
    if (currentIndex > 0) {
      goToPrev();
      return;
    }

    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/');
  }, [currentStep, goToPrev, router, state.bookingType, state.serviceType]);

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
            goToStep={goToStep}
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
      <BookingTopBar onBack={handleTopBarBack} />

      {currentStep === 'service-type' ? (
        renderStep()
      ) : (
        <Container maxW="container.md" py={{ base: 5, md: 8 }}>
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
