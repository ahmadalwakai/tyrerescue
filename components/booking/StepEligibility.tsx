'use client';

import { useState, useEffect, useRef } from 'react';
import { Box, VStack, HStack, Text, Button, Spinner } from '@chakra-ui/react';
import { WizardState } from './types';
import { colorTokens as c } from '@/lib/design-tokens';
import { API } from '@/lib/api-endpoints';

interface EligibilityResult {
  eligible: boolean;
  etaMinutes: number;
  distanceMiles: number;
  source: string;
  driverId: string | null;
  driverName: string | null;
  driversOnline: number;
  message: string;
}

interface StepEligibilityProps {
  state: WizardState;
  updateState: (updates: Partial<WizardState>) => void;
  goToNext: () => void;
  goToPrev: () => void;
}

export function StepEligibility({
  state,
  updateState,
  goToNext,
  goToPrev,
}: StepEligibilityProps) {
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    if (!state.lat || !state.lng) return;
    fetched.current = true;

    async function check() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(API.AVAILABILITY_ELIGIBILITY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: state.lat, lng: state.lng }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Eligibility check failed');
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to check availability');
      } finally {
        setLoading(false);
      }
    }

    check();
  }, [state.lat, state.lng]);

  const handleContinue = () => {
    if (!result?.eligible) return;
    updateState({
      emergencyEta: result.etaMinutes,
      nearestDriverId: result.driverId,
      nearestDriverName: result.driverName,
    });
    goToNext();
  };

  const handleRetry = () => {
    fetched.current = false;
    setResult(null);
    setError(null);
    setLoading(true);
    // Re-trigger by flipping the ref; remount approach
    setTimeout(() => {
      fetched.current = false;
      // Manually re-run
      (async () => {
        try {
          const res = await fetch(API.AVAILABILITY_ELIGIBILITY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: state.lat, lng: state.lng }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Eligibility check failed');
          setResult(data);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to check availability');
        } finally {
          setLoading(false);
        }
      })();
    }, 0);
  };

  // Loading state
  if (loading) {
    return (
      <VStack py={16} gap={4} style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        <Box
          w="48px"
          h="48px"
          borderRadius="full"
          bg={c.accent}
          display="flex"
          alignItems="center"
          justifyContent="center"
          style={{ animation: 'pulseGlow 2s infinite' }}
        >
          <Spinner size="md" color={c.bg} />
        </Box>
        <Text
          fontSize="20px"
          fontWeight="700"
          color={c.text}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          CHECKING AVAILABILITY
        </Text>
        <Text fontSize="14px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>
          Finding the nearest driver to your location...
        </Text>
      </VStack>
    );
  }

  // Error state
  if (error) {
    return (
      <VStack py={12} gap={4} style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        <Box
          p={4}
          bg="rgba(239,68,68,0.1)"
          borderRadius="md"
          borderWidth="1px"
          borderColor="rgba(239,68,68,0.3)"
          textAlign="center"
          w="full"
        >
          <Text fontWeight="600" color="red.400" mb={2}>
            Unable to check availability
          </Text>
          <Text color={c.muted} fontSize="sm" mb={3}>
            {error}
          </Text>
        </Box>
        <HStack gap={3}>
          <Button variant="outline" onClick={goToPrev} borderColor={c.border} color={c.text}>
            Back
          </Button>
          <Button bg={c.accent} color={c.bg} _hover={{ bg: c.accentHover }} onClick={handleRetry}>
            Try Again
          </Button>
        </HStack>
      </VStack>
    );
  }

  // Not eligible
  if (result && !result.eligible) {
    return (
      <VStack py={12} gap={5} style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        <Text
          fontSize={{ base: '28px', md: '40px' }}
          fontWeight="700"
          color={c.text}
          textAlign="center"
          lineHeight="1"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          OUTSIDE SERVICE AREA
        </Text>
        <Box
          p={4}
          bg={c.surface}
          borderRadius="md"
          borderWidth="1px"
          borderColor={c.border}
          textAlign="center"
          w="full"
        >
          <Text color={c.muted} fontSize="14px" mb={3} style={{ fontFamily: 'var(--font-body)' }}>
            {result.message}
          </Text>
          <Text color={c.muted} fontSize="13px" style={{ fontFamily: 'var(--font-body)' }}>
            Call us:{' '}
            <a href="tel:01412660690" style={{ color: c.accent, fontWeight: 600 }}>
              0141 266 0690
            </a>
          </Text>
        </Box>
        <Button variant="outline" onClick={goToPrev} borderColor={c.border} color={c.text}>
          Change Location
        </Button>
      </VStack>
    );
  }

  // Eligible — show ETA and proceed
  return (
    <VStack py={8} gap={6} style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
      <Text
        fontSize={{ base: '28px', md: '40px' }}
        fontWeight="700"
        color={c.text}
        textAlign="center"
        lineHeight="1"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        DRIVER AVAILABLE
      </Text>

      {/* ETA card */}
      <Box
        w="full"
        p={6}
        bg={c.surface}
        borderWidth="2px"
        borderColor={c.accent}
        borderRadius="8px"
        textAlign="center"
        style={{ animation: 'neonHeartbeat 2s ease-in-out infinite' }}
      >
        <Text
          fontSize={{ base: '48px', md: '64px' }}
          fontWeight="700"
          color={c.accent}
          lineHeight="1"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {result!.etaMinutes}
        </Text>
        <Text
          fontSize="14px"
          color={c.muted}
          mt={1}
          letterSpacing="0.1em"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          ESTIMATED MINUTES
        </Text>
        {result!.driverName && (
          <Text
            fontSize="13px"
            color={c.muted}
            mt={3}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Nearest driver: {result!.driverName}
          </Text>
        )}
        <Text
          fontSize="12px"
          color={c.muted}
          mt={1}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {result!.driversOnline} driver{result!.driversOnline !== 1 ? 's' : ''} online
        </Text>
      </Box>

      {/* Navigation */}
      <HStack gap={3} w="full">
        <Button
          variant="outline"
          onClick={goToPrev}
          flex={1}
          h="52px"
          borderColor={c.border}
          color={c.text}
          fontFamily="var(--font-body)"
          _hover={{ borderColor: c.accent }}
        >
          Back
        </Button>
        <Button
          onClick={handleContinue}
          flex={1}
          h="52px"
          bg={c.accent}
          color={c.bg}
          fontSize="20px"
          letterSpacing="0.05em"
          fontFamily="var(--font-display)"
          _hover={{ bg: c.accentHover }}
          style={{ animation: 'btnPulse 2s ease-in-out 0.5s infinite' }}
        >
          CONTINUE {'\u2192'}
        </Button>
      </HStack>
    </VStack>
  );
}
