'use client';

import { Box, Container, Flex, Text } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';

const trustItems = [
  '45-minute emergency response',
  '24/7 mobile tyre fitters',
  'Mainland Scotland coverage',
  'Callout from \u00a349',
] as const;

function CheckIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

export function EmergencyTrustBar() {
  return (
    <Box bg={colorTokens.surface} borderBottomWidth="1px" borderColor={colorTokens.border} px={{ base: 4, md: 8 }}>
      <Container maxW="1180px" px={0}>
        <Flex
          as="ul"
          listStyleType="none"
          m={0}
          py={{ base: '18px', md: '20px' }}
          gap={{ base: '12px', md: '22px' }}
          wrap="wrap"
        >
          {trustItems.map((item) => (
            <Flex key={item} as="li" align="center" gap="8px" minW={{ base: '100%', sm: '220px', lg: 'auto' }}>
              <Box color="#5eead4" lineHeight={0}>
                <CheckIcon />
              </Box>
              <Text fontSize="14px" color={colorTokens.text} fontWeight="700" style={{ fontFamily: 'var(--font-body)' }}>
                {item}
              </Text>
            </Flex>
          ))}
        </Flex>
      </Container>
    </Box>
  );
}
