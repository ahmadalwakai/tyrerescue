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

const colors = {
  bg: colorTokens.bg,
  surface: colorTokens.surface,
  textPrimary: colorTokens.text,
  textSecondary: colorTokens.muted,
  border: colorTokens.border,
};

const faqs = [
  {
    question: 'How quickly can you get to me in an emergency?',
    answer: 'For emergency callouts in Glasgow and Edinburgh city centres, we typically arrive within 45 minutes. For surrounding areas, arrival times vary based on distance but we always provide an accurate ETA when you book.',
  },
  {
    question: 'What areas do you cover?',
    answer: 'We cover Glasgow, Edinburgh, and all surrounding areas across Central Scotland. This includes Paisley, East Kilbride, Hamilton, Livingston, Falkirk, Stirling, Perth, Dundee, and more.',
  },
  {
    question: 'Do you fit tyres I have already purchased?',
    answer: 'We primarily fit tyres purchased through our service to ensure quality and warranty coverage. If you have tyres you need fitted, please call us to discuss.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit and debit cards, Apple Pay, and Google Pay through our secure online checkout. Payment is taken at the time of booking.',
  },
  {
    question: 'Can you repair my puncture or do I need a new tyre?',
    answer: 'Our fitters assess every puncture on arrival. Repairs are only possible when the damage is in the central tread area and the tyre structure is intact. Sidewall damage or multiple punctures require replacement.',
  },
  {
    question: 'What brands of tyres do you stock?',
    answer: 'We stock a wide range of brands including Michelin, Continental, Goodyear, Pirelli, Bridgestone, Dunlop, and quality budget options. We also carry quality part-worn tyres.',
  },
  {
    question: 'How long does a mobile tyre fitting take?',
    answer: 'A standard tyre fitting takes approximately 30 minutes per tyre. Emergency callouts including travel time typically take under an hour from booking to completion.',
  },
  {
    question: 'Do you provide a warranty on fitted tyres?',
    answer: 'Yes, all new tyres come with the manufacturer warranty. Our fitting work is also guaranteed. If you experience any issues related to our fitting, we will resolve them at no extra cost.',
  },
];

function FAQItem({ question, answer, isLast }: { question: string; answer: string; isLast?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Box borderBottomWidth={isLast ? '0' : '1px'} borderColor={colors.border} py={5}>
      <Flex
        justify="space-between"
        align="center"
        cursor="pointer"
        onClick={() => setIsOpen(!isOpen)}
        _hover={{ opacity: 0.8 }}
      >
        <Text fontWeight="500" color={colors.textPrimary} fontSize="16px" pr={4}>
          {question}
        </Text>
        <Text as="span" color={colors.textSecondary} fontSize="20px" fontWeight="300" flexShrink={0}>
          {isOpen ? '−' : '+'}
        </Text>
      </Flex>
      {isOpen && (
        <Text color={colors.textSecondary} fontSize="14px" lineHeight="1.7" mt={4}>
          {answer}
        </Text>
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
            {faqs.map((faq, index) => (
              <Box key={index} style={anim.stagger('fadeUp', index, '0.3s', 0.1, 0.05)}>
                <FAQItem
                  question={faq.question}
                  answer={faq.answer}
                  isLast={index === faqs.length - 1}
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
