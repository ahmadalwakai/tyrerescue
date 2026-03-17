'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Box, HStack, Text, Button, CloseButton } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { BOOKING_DRAFT_KEY } from '@/components/booking/BookingWizard';

const SNOOZE_KEY = 'tyrerescue_reminder_snooze';
const SNOOZE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const DISMISS_KEY = 'tyrerescue_reminder_dismissed';

/** Pages where the reminder should NOT show (user is already booking) */
const BOOKING_PATHS = ['/book', '/success'];

interface DraftEnvelope {
  version: number;
  state: {
    bookingType: string | null;
    address: string;
    bookingId: string | null;
    refNumber: string | null;
  };
  currentStep: string;
  updatedAt: number;
}

function hasActiveDraft(): DraftEnvelope | null {
  try {
    const raw = localStorage.getItem(BOOKING_DRAFT_KEY);
    if (!raw) return null;
    const parsed: DraftEnvelope = JSON.parse(raw);
    // Expired (24h)
    if (Date.now() - parsed.updatedAt > 24 * 60 * 60 * 1000) return null;
    // Already completed (has bookingId + refNumber = paid)
    if (parsed.state?.bookingId && parsed.state?.refNumber) return null;
    // Must have at least started (chosen a booking type)
    if (!parsed.state?.bookingType) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isSnoozed(): boolean {
  try {
    const until = localStorage.getItem(SNOOZE_KEY);
    if (!until) return false;
    return Date.now() < Number(until);
  } catch {
    return false;
  }
}

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === 'true';
  } catch {
    return false;
  }
}

export function BookingReminder() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [draftStep, setDraftStep] = useState<string>('');

  useEffect(() => {
    // Don't show on booking pages
    if (BOOKING_PATHS.some(p => pathname.startsWith(p))) {
      setVisible(false);
      return;
    }

    if (isDismissed() || isSnoozed()) {
      setVisible(false);
      return;
    }

    const draft = hasActiveDraft();
    if (draft) {
      setDraftStep(draft.currentStep);
      // Small delay so it doesn't flash on page load
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
      // Clear dismiss flag if no draft exists any more
      try { localStorage.removeItem(DISMISS_KEY); } catch { /* noop */ }
    }
  }, [pathname]);

  const handleContinue = useCallback(() => {
    window.location.href = '/book';
  }, []);

  const handleSnooze = useCallback(() => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DURATION_MS));
    } catch { /* noop */ }
    setVisible(false);
  }, []);

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch { /* noop */ }
    setVisible(false);
  }, []);

  if (!visible) return null;

  const stepLabel = draftStep
    ? draftStep.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    : '';

  return (
    <Box
      position="fixed"
      bottom={{ base: '16px', md: '24px' }}
      left={{ base: '16px', md: 'auto' }}
      right={{ base: '16px', md: '24px' }}
      maxW={{ base: 'full', md: '420px' }}
      zIndex={100}
      bg={c.surface}
      borderWidth="1px"
      borderColor={c.accent}
      borderRadius="12px"
      p={4}
      boxShadow={`0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${c.accent}40`}
      style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}
    >
      <HStack justify="space-between" align="start" mb={2}>
        <Text
          fontSize="14px"
          fontWeight="600"
          color={c.text}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          You have a booking in progress
        </Text>
        <CloseButton
          size="sm"
          color={c.muted}
          onClick={handleDismiss}
          aria-label="Dismiss booking reminder"
        />
      </HStack>

      {stepLabel && (
        <Text fontSize="12px" color={c.muted} mb={3} style={{ fontFamily: 'var(--font-body)' }}>
          Last step: {stepLabel}
        </Text>
      )}

      <HStack gap={2}>
        <Button
          size="sm"
          bg={c.accent}
          color={c.bg}
          _hover={{ bg: c.accentHover }}
          onClick={handleContinue}
          flex={1}
          h="36px"
          fontFamily="var(--font-body)"
          fontSize="13px"
          fontWeight="600"
        >
          Continue booking
        </Button>
        <Button
          size="sm"
          variant="outline"
          borderColor={c.border}
          color={c.muted}
          _hover={{ borderColor: c.accent, color: c.text }}
          onClick={handleSnooze}
          h="36px"
          fontFamily="var(--font-body)"
          fontSize="13px"
        >
          Remind me later
        </Button>
      </HStack>
    </Box>
  );
}
