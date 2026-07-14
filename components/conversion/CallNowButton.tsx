'use client';

import { Link as ChakraLink } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';
import {
  EMERGENCY_PHONE_DISPLAY,
  EMERGENCY_PHONE_HREF,
} from '@/lib/ads/emergencyCampaign';
import { trackEmergencyCallClick } from '@/lib/analytics/conversions';

type CallNowButtonProps = {
  readonly source: 'emergency_hero' | 'emergency_sticky_mobile' | 'emergency_pricing' | 'emergency_local' | 'emergency_footer';
  readonly label?: string;
  readonly fullWidth?: boolean;
  readonly variant?: 'primary' | 'dark';
};

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

export function CallNowButton({
  source,
  label = `Call ${EMERGENCY_PHONE_DISPLAY}`,
  fullWidth = false,
  variant = 'primary',
}: CallNowButtonProps) {
  const isDark = variant === 'dark';

  return (
    <ChakraLink
      href={EMERGENCY_PHONE_HREF}
      onClick={() => trackEmergencyCallClick(source)}
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      gap="10px"
      w={fullWidth ? '100%' : { base: '100%', sm: 'auto' }}
      minH="54px"
      px={{ base: '20px', md: '28px' }}
      bg={isDark ? colorTokens.bg : colorTokens.accent}
      color={isDark ? colorTokens.accent : 'white'}
      borderWidth="1px"
      borderColor={isDark ? colorTokens.bg : colorTokens.accent}
      borderRadius="8px"
      fontSize={{ base: '18px', md: '20px' }}
      fontWeight="900"
      letterSpacing="0"
      textAlign="center"
      textDecoration="none"
      transition="transform 0.2s ease, opacity 0.2s ease, background 0.2s ease"
      _hover={{
        bg: isDark ? '#121214' : colorTokens.accentHover,
        textDecoration: 'none',
        transform: 'translateY(-1px)',
      }}
      _active={{ transform: 'scale(0.98)' }}
      aria-label={`Call ${EMERGENCY_PHONE_DISPLAY} now for emergency tyre fitting`}
      style={{ fontFamily: 'var(--font-display)' }}
    >
      <PhoneIcon />
      {label}
    </ChakraLink>
  );
}
