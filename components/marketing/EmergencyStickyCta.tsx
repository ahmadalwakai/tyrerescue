'use client';

import { Box, Flex, Link as ChakraLink, Text } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { trackCallClick } from '@/lib/analytics/gtag';

function PhoneIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export type EmergencyStickyCtaProps = {
  phoneDisplay: string;
  phoneHref: string;
  /** Optional override: called instead of navigating to /emergency. */
  onChatClick?: () => void;
};

/**
 * Prominent twin-button CTA block for the emergency landing page.
 *
 * Not a fixed/sticky element — the global FloatingContactBar already
 * handles sticky mobile behaviour. This renders inline within the hero
 * and bottom-CTA sections.
 */
export function EmergencyStickyCta({
  phoneDisplay,
  phoneHref,
  onChatClick,
}: EmergencyStickyCtaProps) {
  return (
    <Box style={anim.fadeUp('0.5s', '0.15s')}>
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        gap="12px"
        flexWrap="wrap"
      >
        {/* Primary — Call Now */}
        <ChakraLink
          href={phoneHref}
          onClick={() => trackCallClick('emergency_landing_hero')}
          display="flex"
          alignItems="center"
          justifyContent="center"
          gap="10px"
          h={{ base: '56px', md: '60px' }}
          px={{ base: '20px', md: '32px' }}
          bg={`linear-gradient(135deg, ${colorTokens.accent} 0%, ${colorTokens.accentHover} 100%)`}
          color="white"
          borderRadius="14px"
          fontSize={{ base: '17px', md: '19px' }}
          fontWeight="900"
          letterSpacing="0.04em"
          flex={{ base: '1 1 100%', sm: '0 0 auto' }}
          minW="0"
          transition="all 0.25s cubic-bezier(0.4,0,0.2,1)"
          _hover={{
            boxShadow: `0 6px 28px ${colorTokens.accentGlow}`,
            transform: 'translateY(-1px)',
            textDecoration: 'none',
          }}
          _active={{ transform: 'scale(0.97)' }}
          aria-label={`Call ${phoneDisplay} for emergency tyre fitting`}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <PhoneIcon />
          Call {phoneDisplay}
        </ChakraLink>

        {/* Secondary — Start Emergency Help */}
        {onChatClick ? (
          <Box
            as="button"
            onClick={onChatClick}
            display="flex"
            alignItems="center"
            justifyContent="center"
            gap="8px"
            h={{ base: '56px', md: '60px' }}
            px={{ base: '20px', md: '32px' }}
            bg="transparent"
            color={colorTokens.text}
            border="2px solid"
            borderColor={colorTokens.border}
            borderRadius="14px"
            fontSize={{ base: '15px', md: '16px' }}
            fontWeight="700"
            flex={{ base: '1 1 100%', sm: '0 0 auto' }}
            minW="0"
            cursor="pointer"
            transition="all 0.25s cubic-bezier(0.4,0,0.2,1)"
            _hover={{ borderColor: colorTokens.accent, color: colorTokens.accent }}
            _active={{ transform: 'scale(0.97)' }}
            aria-label="Start emergency tyre help request"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Start Emergency Help
            <ArrowRightIcon />
          </Box>
        ) : (
          <ChakraLink
            href="/emergency"
            display="flex"
            alignItems="center"
            justifyContent="center"
            gap="8px"
            h={{ base: '56px', md: '60px' }}
            px={{ base: '20px', md: '32px' }}
            bg="transparent"
            color={colorTokens.text}
            border="2px solid"
            borderColor={colorTokens.border}
            borderRadius="14px"
            fontSize={{ base: '15px', md: '16px' }}
            fontWeight="700"
            flex={{ base: '1 1 100%', sm: '0 0 auto' }}
            minW="0"
            transition="all 0.25s cubic-bezier(0.4,0,0.2,1)"
            _hover={{
              borderColor: colorTokens.accent,
              color: colorTokens.accent,
              textDecoration: 'none',
            }}
            _active={{ transform: 'scale(0.97)' }}
            aria-label="Start emergency tyre help request"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Start Emergency Help
            <ArrowRightIcon />
          </ChakraLink>
        )}
      </Flex>

      <Text
        mt="14px"
        fontSize="13px"
        color={colorTokens.muted}
        style={{ fontFamily: 'var(--font-body)' }}
      >
        Availability confirmed when you contact us.
      </Text>
    </Box>
  );
}
