'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Box, Flex, Text, Link as ChakraLink } from '@chakra-ui/react';
import { trackWhatsAppClick, trackCallClick } from '@/lib/analytics/gtag';
import {
  buildWhatsAppHref,
  buildWhatsAppOptions,
  DEFAULT_WHATSAPP_PHONE,
  FALLBACK_WHATSAPP_MESSAGE,
  type WhatsAppContext,
  type WhatsAppContextSource,
  type WhatsAppOption,
} from '@/lib/contact/whatsapp-options';

interface WhatsAppQuickHelpSheetProps {
  open: boolean;
  onClose: () => void;
  /** Phone target for the Call instead secondary action (display + tel). */
  phoneNumber: string;
  /** WhatsApp phone (digits only) — defaults to env / hardcoded site number. */
  whatsappPhone?: string;
}

const BOOKING_DRAFT_KEY = 'tyrerescue_booking_draft';

interface DraftSnapshot {
  source: WhatsAppContextSource;
  trackingId: string | null;
  quote: WhatsAppContext['quote'];
}

function detectSourceFromPath(pathname: string | null): WhatsAppContextSource {
  if (!pathname) return 'home';
  if (pathname.startsWith('/tracking/') || pathname === '/tracking') return 'tracking';
  if (pathname.startsWith('/book') || pathname.startsWith('/quote')) return 'quote';
  return 'home';
}

function extractTrackingRef(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/tracking\/([^/?#]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * Read in-progress booking draft from localStorage on the client only.
 * Returns null on SSR or if anything goes wrong.
 */
function readClientSnapshot(pathname: string | null): DraftSnapshot {
  const baseSource = detectSourceFromPath(pathname);
  const trackingId = extractTrackingRef(pathname);
  const empty: DraftSnapshot = {
    source: baseSource,
    trackingId,
    quote: null,
  };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(BOOKING_DRAFT_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as {
      state?: {
        address?: unknown;
        vehicleReg?: unknown;
        conditionAssessment?: unknown;
      };
      currentStep?: unknown;
    } | null;
    const state = parsed?.state ?? {};
    const address = typeof state.address === 'string' ? state.address : null;
    const reg = typeof state.vehicleReg === 'string' ? state.vehicleReg : null;
    const cond = typeof state.conditionAssessment === 'string' ? state.conditionAssessment : null;

    let problem: string | null = null;
    if (cond === 'repair') problem = 'Tyre may need repair';
    else if (cond === 'replacement') problem = 'Tyre needs replacement';
    else if (cond === 'not_sure') problem = 'Not sure if repair or replacement';

    // Promote to checkout if user is on the booking wizard at the payment step.
    let source = baseSource;
    if (baseSource === 'quote' && parsed?.currentStep === 'payment') {
      source = 'checkout';
    }

    return {
      source,
      trackingId,
      quote: {
        location: address,
        registration: reg,
        problem,
      },
    };
  } catch {
    return empty;
  }
}

export function WhatsAppQuickHelpSheet({
  open,
  onClose,
  phoneNumber,
  whatsappPhone,
}: WhatsAppQuickHelpSheetProps) {
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState<DraftSnapshot | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // Defer client-only reads until after open — avoids hydration mismatches.
  useEffect(() => {
    if (!open) return;
    setSnapshot(readClientSnapshot(pathname));
  }, [open, pathname]);

  // Track sheet open + manage focus / scroll lock / Esc.
  useEffect(() => {
    if (!open) return;
    try {
      trackWhatsAppClick('sheet_opened');
    } catch {
      /* analytics is non-critical */
    }
    lastFocusedRef.current = (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);
    const prevOverflow = typeof document !== 'undefined' ? document.body.style.overflow : '';
    if (typeof document !== 'undefined') document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    // Move focus to close button for keyboard / screen-reader users.
    const t = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      if (typeof document !== 'undefined') document.body.style.overflow = prevOverflow;
      lastFocusedRef.current?.focus?.();
    };
  }, [open, onClose]);

  const ctx: WhatsAppContext = useMemo(() => {
    if (!snapshot) {
      return { source: detectSourceFromPath(pathname), trackingId: extractTrackingRef(pathname), quote: null };
    }
    return { source: snapshot.source, trackingId: snapshot.trackingId, quote: snapshot.quote };
  }, [snapshot, pathname]);

  const options = useMemo(() => buildWhatsAppOptions(ctx).slice(0, 4), [ctx]);

  if (!open) return null;

  const phoneTel = phoneNumber.replace(/\s/g, '');

  const handleSelect = (opt: WhatsAppOption) => {
    try {
      trackWhatsAppClick(`sheet_option:${opt.id}`);
    } catch {
      /* non-critical */
    }
    const href = buildWhatsAppHref(opt.message, whatsappPhone ?? DEFAULT_WHATSAPP_PHONE);
    if (typeof window !== 'undefined') {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
    onClose();
  };

  const handleCall = () => {
    try {
      trackCallClick('whatsapp_sheet_call_instead');
    } catch {
      /* non-critical */
    }
    onClose();
  };

  return (
    <Box
      position="fixed"
      inset={0}
      zIndex={2000}
      role="dialog"
      aria-modal="true"
      aria-labelledby="whatsapp-sheet-title"
      aria-describedby="whatsapp-sheet-subtitle"
    >
      {/* Backdrop */}
      <Box
        position="absolute"
        inset={0}
        bg="rgba(0,0,0,0.6)"
        onClick={onClose}
        style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        aria-hidden="true"
      />

      {/* Sheet */}
      <Box
        position="absolute"
        left={0}
        right={0}
        bottom={0}
        mx="auto"
        maxW={{ base: '100%', md: '480px' }}
        bg="#18181B"
        color="#FAFAFA"
        borderTopRadius="20px"
        borderTop="2px solid #F97316"
        borderLeft={{ base: 'none', md: '1px solid #3F3F46' }}
        borderRight={{ base: 'none', md: '1px solid #3F3F46' }}
        boxShadow="0 -16px 48px rgba(0,0,0,0.55)"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <Flex align="flex-start" justify="space-between" px="20px" pt="20px" pb="4px">
          <Box>
            <Text
              id="whatsapp-sheet-title"
              as="h2"
              fontSize="18px"
              fontWeight="800"
              lineHeight="1.2"
              color="#FAFAFA"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              WhatsApp help
            </Text>
            <Text
              id="whatsapp-sheet-subtitle"
              fontSize="14px"
              color="#A1A1AA"
              mt="4px"
            >
              Choose what you want to send.
            </Text>
          </Box>
          <Box
            as="button"
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close WhatsApp help"
            minW="44px"
            minH="44px"
            ml="12px"
            borderRadius="10px"
            bg="transparent"
            color="#FAFAFA"
            border="1px solid #3F3F46"
            fontSize="14px"
            fontWeight="700"
            cursor="pointer"
            _hover={{ bg: '#27272A' }}
            _active={{ transform: 'scale(0.96)' }}
          >
            Close
          </Box>
        </Flex>

        <Flex direction="column" gap="10px" px="16px" py="16px">
          {options.map((opt) => (
            <Box
              as="button"
              key={opt.id}
              onClick={() => handleSelect(opt)}
              textAlign="left"
              w="100%"
              minH="68px"
              px="16px"
              py="12px"
              bg="#27272A"
              color="#FAFAFA"
              border="1px solid #3F3F46"
              borderRadius="14px"
              cursor="pointer"
              transition="all 0.2s cubic-bezier(0.4,0,0.2,1)"
              _hover={{ borderColor: '#F97316', bg: '#2D2D30' }}
              _focusVisible={{
                outline: '2px solid #F97316',
                outlineOffset: '2px',
              }}
              _active={{ transform: 'scale(0.99)' }}
              aria-label={`${opt.title}. ${opt.preview}`}
            >
              <Text fontSize="15px" fontWeight="700" lineHeight="1.25">
                {opt.title}
              </Text>
              <Text fontSize="13px" color="#A1A1AA" mt="4px" lineHeight="1.4">
                {opt.preview}
              </Text>
            </Box>
          ))}
        </Flex>

        <Box px="16px" pb="16px">
          <ChakraLink
            href={`tel:${phoneTel}`}
            onClick={handleCall}
            display="flex"
            alignItems="center"
            justifyContent="center"
            w="100%"
            minH="44px"
            px="16px"
            py="10px"
            bg="transparent"
            color="#A1A1AA"
            border="1px solid #3F3F46"
            borderRadius="12px"
            fontSize="14px"
            fontWeight="700"
            textDecoration="none"
            _hover={{ color: '#F97316', borderColor: '#F97316' }}
            _focusVisible={{ outline: '2px solid #F97316', outlineOffset: '2px' }}
            aria-label={`Call ${phoneNumber} instead`}
          >
            Call instead — {phoneNumber}
          </ChakraLink>
        </Box>
      </Box>
    </Box>
  );
}

export { FALLBACK_WHATSAPP_MESSAGE };
