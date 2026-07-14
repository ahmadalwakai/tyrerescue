'use client';

import { Box, Text, Flex, Container } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';
import { EMERGENCY_PAGE_FAQS, type FaqItem } from './emergency-faq-data';

export type { FaqItem };

type EmergencyFaqProps = {
  readonly faqs?: readonly FaqItem[];
  readonly framed?: boolean;
};

export function EmergencyFaq({ faqs = EMERGENCY_PAGE_FAQS, framed = false }: EmergencyFaqProps) {
  const list = (
    <Box as="ul" listStyleType="none" p={0} m={0}>
      {faqs.map((faq) => (
        <Box
          key={faq.question}
          as="li"
          borderBottomWidth="1px"
          borderColor={colorTokens.border}
          py={{ base: '20px', md: '24px' }}
        >
          <Flex gap="14px" align="flex-start">
            <Text
              fontSize="15px"
              fontWeight="900"
              color={colorTokens.accent}
              flexShrink={0}
              mt="1px"
              style={{ fontFamily: 'var(--font-display)', lineHeight: '1' }}
            >
              Q
            </Text>
            <Box>
              <Text
                as="h3"
                fontSize={{ base: '16px', md: '18px' }}
                fontWeight="800"
                color={colorTokens.text}
                mb="8px"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {faq.question}
              </Text>
              <Text
                fontSize={{ base: '14px', md: '15px' }}
                color={colorTokens.muted}
                lineHeight="1.75"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {faq.answer}
              </Text>
            </Box>
          </Flex>
        </Box>
      ))}
    </Box>
  );

  if (!framed) return list;

  return (
    <Box as="section" bg={colorTokens.bg} py={{ base: '44px', md: '72px' }} px={{ base: 4, md: 8 }}>
      <Container maxW="900px" px={0}>
        <Text
          as="h2"
          fontSize={{ base: '32px', md: '52px' }}
          lineHeight="1"
          color={colorTokens.text}
          mb={{ base: '18px', md: '28px' }}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Emergency tyre fitting FAQ
        </Text>
        {list}
      </Container>
    </Box>
  );
}
