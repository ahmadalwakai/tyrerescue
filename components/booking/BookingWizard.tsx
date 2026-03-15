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
import { StepTyreDetails } from './StepTyreDetails';
import { StepTyreSelection } from './StepTyreSelection';
import { StepSchedule } from './StepSchedule';
import { StepPricing } from './StepPricing';
import { StepCustomerDetails } from './StepCustomerDetails';
import { StepPayment } from './StepPayment';
import { colorTokens as c } from '@/lib/design-tokens';

const STORAGE_KEY = 'tyrerescue_booking_wizard';

interface StepIndicatorProps {
  steps: StepConfig[];
  currentStep: WizardStep;
}

function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  const currentIndex = steps.findIndex(s => s.key === currentStep);

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
              {/* Connector line */}
              {index > 0 && (
                <Box
                  position="absolute"
                  top="12px"
                  left="0"
                  right="50%"
                  h="2px"
                  bg={isCompleted || isActive ? c.accent : c.border}
                />
              )}
              {index < steps.length - 1 && (
                <Box
                  position="absolute"
                  top="12px"
                  left="50%"
                  right="0"
                  h="2px"
                  bg={isCompleted ? c.accent : c.border}
                />
              )}

              {/* Step number */}
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
              >
                {isCompleted ? '\u2713' : step.number}
              </Box>

              {/* Step name */}
              <Text
                fontSize="xs"
                fontWeight={isActive ? '600' : '400'}
                color={isActive ? c.accent : isCompleted ? c.text : c.muted}
                whiteSpace="nowrap"
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

export interface BookingWizardProps {
  initialStep?: WizardStep;
  initialState?: Partial<WizardState>;
}

export function BookingWizard({ initialStep, initialState }: BookingWizardProps) {
  const router = useRouter();
  const [state, setState] = useState<WizardState>({ ...initialWizardState, ...initialState });
  const [currentStep, setCurrentStep] = useState<WizardStep>(initialStep || 'service-type');
  const [isHydrated, setIsHydrated] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore state from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setState(parsed.state || initialWizardState);
        if (!initialStep && parsed.currentStep) {
          setCurrentStep(parsed.currentStep);
        }
      } catch {
        // Corrupted storage — start fresh
      }
    }
    setIsHydrated(true);
  }, [initialStep]);

  // Debounced save to sessionStorage (300ms)
  useEffect(() => {
    if (!isHydrated) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ state, currentStep })
      );
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
      goToStep(steps[currentIndex + 1].key);
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
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const handlePaymentSuccess = useCallback((refNumber: string) => {
    sessionStorage.removeItem(STORAGE_KEY);
    router.push(`/success/${refNumber}`);
  }, [router]);

  const handlePaymentError = useCallback((error: string) => {
    // Stay on payment step to allow retry
  }, []);

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
              bg={c.card}
              borderRadius="lg"
              p={{ base: 4, md: 6 }}
              borderWidth="1px"
              borderColor={c.border}
              aria-live="polite"
            >
              {renderStep()}
            </Box>

            {/* Reset link */}
            {currentStep !== 'payment' && (
              <Text
                fontSize="sm"
                color={c.muted}
                textAlign="center"
                cursor="pointer"
                _hover={{ color: c.text }}
                onClick={resetWizard}
              >
                Start over
              </Text>
            )}
          </VStack>
        </Container>
      )}
    </ErrorBoundary>
  );
}
