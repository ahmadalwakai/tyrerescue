'use client';

import { Box, Text, Flex } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { EMERGENCY_PAGE_FAQS, type FaqItem } from './emergency-faq-data';

export type { FaqItem };

export function EmergencyFaq({ faqs = EMERGENCY_PAGE_FAQS }: { faqs?: FaqItem[] }) {
  return (
    <Box as="ul" listStyleType="none" p={0} m={0}>
      {faqs.map((faq, i) => (
        <Box
          key={faq.question}
          as="li"
          bg={i % 2 === 0 ? colorTokens.surface : colorTokens.bg}
          borderBottom="1px solid"
          borderColor={colorTokens.border}
          p={{ base: '20px 0', md: '24px 0' }}
          style={anim.stagger('fadeUp', i, '0.35s', 0, 0.07)}
        >
          <Flex gap="14px" align="flex-start">
            <Text
              fontSize="15px"
              fontWeight="700"
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
                fontSize={{ base: '15px', md: '16px' }}
                fontWeight="600"
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
}
