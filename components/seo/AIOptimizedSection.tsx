'use client';

import { Box, Text, Flex } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';
import type { ReactNode } from 'react';

const colors = {
  bg: colorTokens.bg,
  surface: colorTokens.surface,
  card: colorTokens.card,
  accent: colorTokens.accent,
  textPrimary: colorTokens.text,
  textSecondary: colorTokens.muted,
  border: colorTokens.border,
};

interface AIOptimizedSectionProps {
  question: string;
  directAnswer: string;
  detailedAnswer: ReactNode;
  relatedQuestions?: string[];
  entityType?: 'service' | 'process' | 'pricing' | 'location' | 'safety';
}

export function AIOptimizedSection({
  question,
  directAnswer,
  detailedAnswer,
  relatedQuestions,
  entityType = 'service',
}: AIOptimizedSectionProps) {
  return (
    <Box
      as="section"
      mb={{ base: '40px', md: '60px' }}
      itemScope
      itemType="https://schema.org/Question"
      data-ai-snippet="primary"
      data-entity-type={entityType}
    >
      {/* Question */}
      <Text
        as="h2"
        fontSize={{ base: '24px', md: '32px' }}
        fontWeight="700"
        color={colors.textPrimary}
        mb="20px"
        itemProp="name"
        style={{ fontFamily: 'var(--font-body)' }}
      >
        {question}
      </Text>

      {/* Direct Answer — AI snippet target */}
      <Box
        data-snippet-priority="high"
        itemScope
        itemType="https://schema.org/Answer"
        itemProp="acceptedAnswer"
        bg={colors.card}
        border="2px solid"
        borderColor={colors.accent}
        borderRadius="12px"
        p={{ base: '20px', md: '30px' }}
        mb="30px"
      >
        <Text
          itemProp="text"
          fontSize={{ base: '16px', md: '18px' }}
          fontWeight="600"
          lineHeight="1.7"
          color={colors.textPrimary}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {directAnswer}
        </Text>
      </Box>

      {/* Detailed content */}
      <Box>{detailedAnswer}</Box>

      {/* Related questions */}
      {relatedQuestions && relatedQuestions.length > 0 && (
        <Box mt="40px" pt="30px" borderTop="1px solid" borderColor={colors.border}>
          <Text
            as="h3"
            fontSize={{ base: '18px', md: '22px' }}
            fontWeight="600"
            color={colors.textPrimary}
            mb="16px"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Related Questions
          </Text>
          <Flex direction="column" gap="12px">
            {relatedQuestions.map((q, i) => (
              <Text
                key={i}
                data-related-query=""
                fontSize="15px"
                color={colors.textSecondary}
                pl="24px"
                position="relative"
                style={{ fontFamily: 'var(--font-body)' }}
                css={{
                  '&::before': {
                    content: '"→"',
                    position: 'absolute',
                    left: '0',
                    color: colors.accent,
                    fontWeight: 'bold',
                  },
                }}
              >
                {q}
              </Text>
            ))}
          </Flex>
        </Box>
      )}
    </Box>
  );
}
