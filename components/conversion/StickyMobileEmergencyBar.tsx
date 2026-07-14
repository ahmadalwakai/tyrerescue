'use client';

import { Box, Flex, Link as ChakraLink } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';
import { CallNowButton } from '@/components/conversion/CallNowButton';
import { trackEmergencyBookingClick } from '@/lib/analytics/conversions';

function CalendarIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

export function StickyMobileEmergencyBar() {
  return (
    <Box
      display={{ base: 'block', md: 'none' }}
      position="fixed"
      left={0}
      right={0}
      bottom={0}
      zIndex={60}
      bg="rgba(9,9,11,0.94)"
      borderTop="1px solid"
      borderColor="rgba(63,63,70,0.7)"
      boxShadow="0 -10px 28px rgba(0,0,0,0.45)"
      style={{
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <Flex gap="10px" px="12px" py="10px">
        <Box flex="1" minW={0}>
          <CallNowButton
            source="emergency_sticky_mobile"
            label="Call now"
            fullWidth
          />
        </Box>
        <ChakraLink
          href="/book"
          onClick={() => trackEmergencyBookingClick('emergency_sticky_mobile')}
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          gap="8px"
          flex="1"
          minH="54px"
          px="14px"
          bg={colorTokens.card}
          color={colorTokens.text}
          borderWidth="1px"
          borderColor={colorTokens.border}
          borderRadius="8px"
          fontSize="17px"
          fontWeight="900"
          textDecoration="none"
          _hover={{ textDecoration: 'none', borderColor: colorTokens.accent }}
          _active={{ transform: 'scale(0.98)' }}
          aria-label="Book emergency tyre fitting online"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <CalendarIcon />
          Book
        </ChakraLink>
      </Flex>
    </Box>
  );
}
