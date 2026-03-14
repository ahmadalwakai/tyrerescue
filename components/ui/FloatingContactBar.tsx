'use client';

import { Box, Link as ChakraLink } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';

const PHONE_NUMBER = process.env.NEXT_PUBLIC_PHONE_NUMBER || '0141 266 0690';

export function FloatingContactBar() {
  return (
    <Box
      position="fixed"
      bottom={0}
      right={0}
      zIndex={50}
      p="16px"
      display={{ base: 'none', md: 'block' }}
    >
      <ChakraLink
        href={`tel:${PHONE_NUMBER.replace(/\s/g, '')}`}
        px="20px"
        py="12px"
        bg={colorTokens.surface}
        color={colorTokens.text}
        borderRadius="8px"
        borderWidth="1px"
        borderColor={colorTokens.border}
        fontSize="13px"
        fontWeight="600"
        textAlign="center"
        transition="all 0.2s"
        _hover={{ borderColor: colorTokens.accent, color: colorTokens.accent }}
        style={{ fontFamily: 'var(--font-body)' }}
      >
        {PHONE_NUMBER}
      </ChakraLink>
    </Box>
  );
}
