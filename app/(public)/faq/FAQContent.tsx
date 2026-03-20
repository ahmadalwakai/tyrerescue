'use client';

import { useState } from 'react';
import {
  Box,
  Container,
  Heading,
  Text,
  Flex,
} from '@chakra-ui/react';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { colorTokens } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { faqItems } from '@/lib/content/faq';

const colors = {
  bg: colorTokens.bg,
  surface: colorTokens.surface,
  textPrimary: colorTokens.text,
  textSecondary: colorTokens.muted,
  border: colorTokens.border,
};

function FAQItem({ question, answer, isLast }: { question: string; answer: string; isLast?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Box borderBottomWidth={isLast ? '0' : '1px'} borderColor={colors.border} py={5} itemScope itemType="https://schema.org/Question">
      <Flex
        justify="space-between"
        align="center"
        cursor="pointer"
        onClick={() => setIsOpen(!isOpen)}
        _hover={{ opacity: 0.8 }}
      >
        <Text fontWeight="500" color={colors.textPrimary} fontSize="16px" pr={4} itemProp="name">
          {question}
        </Text>
        <Text as="span" color={colors.textSecondary} fontSize="20px" fontWeight="300" flexShrink={0}>
          {isOpen ? '−' : '+'}
        </Text>
      </Flex>
      {isOpen && (
        <Box itemScope itemType="https://schema.org/Answer" itemProp="acceptedAnswer">
          <Text color={colors.textSecondary} fontSize="14px" lineHeight="1.7" mt={4} itemProp="text">
            {answer}
          </Text>
        </Box>
      )}
    </Box>
  );
}

export function FAQContent() {
  return (
    <Box minH="100vh" display="flex" flexDirection="column" bg={colors.bg}>
      <Nav />
      <Box as="main" flex={1} py={{ base: 16, md: 24 }}>
        <Container maxW="4xl">
          <Heading
            as="h1"
            fontSize={{ base: '32px', md: '48px' }}
            fontWeight="900"
            color={colors.textPrimary}
            letterSpacing="-0.03em"
            mb={4}
            style={anim.fadeUp('0.5s')}
          >
            Frequently Asked Questions
          </Heading>
          <Text fontSize="18px" color={colors.textSecondary} mb={12} maxW="600px" style={anim.fadeUp('0.5s', '0.1s')}>
            Everything you need to know about our mobile tyre fitting service.
          </Text>

          <Box>
            {faqItems.map((faq, index) => (
              <Box key={faq.id} style={anim.stagger('fadeUp', index, '0.3s', 0.1, 0.05)}>
                <FAQItem
                  question={faq.question}
                  answer={faq.answer}
                  isLast={index === faqItems.length - 1}
                />
              </Box>
            ))}
          </Box>
        </Container>
      </Box>
      <Footer />
    </Box>
  );
}
