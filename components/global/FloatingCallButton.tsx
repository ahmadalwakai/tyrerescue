'use client';

import { Box, Link as ChakraLink } from '@chakra-ui/react';

const PHONE_NUMBER = process.env.NEXT_PUBLIC_PHONE_NUMBER || '0141 266 0690';

export function FloatingCallButton() {
  return (
    <Box
      position="fixed"
      bottom={{ base: '20px', md: '24px' }}
      right={{ base: '16px', md: '20px' }}
      zIndex={40}
    >
      <ChakraLink
        href={`tel:${PHONE_NUMBER.replace(/\s/g, '')}`}
        className="floating-call-btn"
        display="flex"
        alignItems="center"
        justifyContent="center"
        w={{ base: '56px', md: '56px' }}
        h={{ base: '56px', md: '56px' }}
        borderRadius="full"
        bg="#f97316"
        color="white"
        boxShadow="0 4px 14px rgba(249,115,22,0.4)"
        transition="all 0.2s"
        _hover={{
          bg: '#ea580c',
          transform: 'translateY(-2px)',
          boxShadow: '0 6px 20px rgba(249,115,22,0.5)',
        }}
        _active={{ transform: 'scale(0.94)' }}
        aria-label="Call now"
        style={{ animation: 'floatingCallPulse 2.5s ease-in-out infinite' }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      </ChakraLink>
    </Box>
  );
}
