'use client';

import { useState } from 'react';
import { Box, Flex, Link as ChakraLink, Text } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';

const PHONE_NUMBER = process.env.NEXT_PUBLIC_PHONE_NUMBER || '0141 266 0690';

export function FloatingContactBar() {
  const [minimized, setMinimized] = useState(false);

  return (
    <Box
      position="fixed"
      bottom={0}
      right={0}
      zIndex={50}
      p="16px"
      display={{ base: 'none', md: 'block' }}
    >
      {minimized ? (
        <Box
          as="button"
          w="40px"
          h="40px"
          bg={colorTokens.surface}
          color={colorTokens.accent}
          borderRadius="8px"
          borderWidth="1px"
          borderColor={colorTokens.border}
          display="flex"
          alignItems="center"
          justifyContent="center"
          cursor="pointer"
          transition="all 0.2s"
          _hover={{ borderColor: colorTokens.accent }}
          onClick={() => setMinimized(false)}
          aria-label="Expand contact options"
          style={{ fontFamily: 'var(--font-display)', fontSize: '18px' }}
        >
          ☎
        </Box>
      ) : (
        <Flex
          gap={2}
          align="center"
          bg={colorTokens.surface}
          borderRadius="8px"
          borderWidth="1px"
          borderColor={colorTokens.border}
          p="8px"
        >
          <ChakraLink
            href={`tel:${PHONE_NUMBER.replace(/\s/g, '')}`}
            px="16px"
            py="8px"
            bg="transparent"
            color={colorTokens.text}
            borderRadius="4px"
            fontSize="13px"
            fontWeight="600"
            transition="all 0.2s"
            _hover={{ color: colorTokens.accent }}
            aria-label={`Call ${PHONE_NUMBER}`}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {PHONE_NUMBER}
          </ChakraLink>
          <ChakraLink
            href="https://wa.me/447423262955"
            target="_blank"
            rel="noopener noreferrer"
            px="12px"
            py="8px"
            bg="transparent"
            color="#25D366"
            borderRadius="4px"
            fontSize="13px"
            fontWeight="600"
            transition="all 0.2s"
            _hover={{ bg: 'rgba(37,211,102,0.08)' }}
            aria-label="WhatsApp us"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            WhatsApp
          </ChakraLink>
          <Text
            as="button"
            fontSize="14px"
            color={colorTokens.muted}
            bg="transparent"
            border="none"
            cursor="pointer"
            px="4px"
            _hover={{ color: colorTokens.text }}
            transition="color 0.2s"
            onClick={() => setMinimized(true)}
            aria-label="Minimize contact bar"
          >
            ✕
          </Text>
        </Flex>
      )}
    </Box>
  );
}
