'use client';

import { Box, Flex, Link as ChakraLink } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';

const PHONE_NUMBER = process.env.NEXT_PUBLIC_PHONE_NUMBER || '0141 266 0690';
const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '441412660690';

const colors = {
  card: colorTokens.card,
  accent: colorTokens.accent,
  accentHover: colorTokens.accentHover,
  textPrimary: colorTokens.text,
  bg: colorTokens.bg,
  border: colorTokens.border,
};

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
      <Flex direction="column" gap="8px">
        <ChakraLink
          href={`tel:${PHONE_NUMBER.replace(/\s/g, '')}`}
          px="20px"
          py="12px"
          bg={colors.card}
          color={colors.textPrimary}
          borderRadius="4px"
          borderWidth="1px"
          borderColor={colors.border}
          fontSize="13px"
          fontWeight="600"
          textAlign="center"
          transition="all 0.2s"
          _hover={{ borderColor: colors.accent }}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {PHONE_NUMBER}
        </ChakraLink>
        <ChakraLink
          href={`https://wa.me/${WHATSAPP_NUMBER}`}
          target="_blank"
          rel="noopener noreferrer"
          px="20px"
          py="12px"
          bg={colors.accent}
          color={colors.bg}
          borderRadius="4px"
          fontSize="13px"
          fontWeight="600"
          textAlign="center"
          transition="all 0.2s"
          _hover={{ bg: colors.accentHover }}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          WhatsApp
        </ChakraLink>
      </Flex>
    </Box>
  );
}
