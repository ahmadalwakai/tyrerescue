'use client';

import { Box, Container, Heading, Text } from '@chakra-ui/react';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { colorTokens } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { Animated } from '@/components/ui/Animated';

const colors = {
  bg: colorTokens.bg,
  textPrimary: colorTokens.text,
  textSecondary: colorTokens.muted,
  border: colorTokens.border,
};

export function RefundContent() {
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
            mb={8}
            style={anim.fadeUp('0.5s')}
          >
            Refund Policy
          </Heading>
          <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8" mb={6} style={anim.fadeUp('0.5s', '0.1s')}>
            We want you to be satisfied with our service. This policy outlines when and how refunds are processed.
          </Text>
          <Animated animation={anim.fadeUp('0.5s')}>
            <Heading as="h2" fontSize="20px" fontWeight="600" color={colors.textPrimary} mb={4} mt={8}>
              Cancellation Before Service
            </Heading>
            <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8" mb={6}>
              Cancellations made more than 2 hours before the scheduled appointment will receive a full refund. Cancellations within 2 hours may incur a callout fee.
            </Text>
          </Animated>
          <Animated animation={anim.fadeUp('0.5s')}>
            <Heading as="h2" fontSize="20px" fontWeight="600" color={colors.textPrimary} mb={4} mt={8}>
              After Service Completion
            </Heading>
            <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8" mb={6}>
              Once tyres have been fitted, refunds are only available if there is a manufacturing defect or fitting error. Please contact us within 48 hours of service.
            </Text>
          </Animated>
          <Animated animation={anim.fadeUp('0.5s')}>
            <Heading as="h2" fontSize="20px" fontWeight="600" color={colors.textPrimary} mb={4} mt={8}>
              How to Request a Refund
            </Heading>
            <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8">
              Contact us at 0141 266 0690 or info@tyrerescue.uk with your booking reference number. Refunds are processed within 5-10 business days.
            </Text>
          </Animated>
        </Container>
      </Box>
      <Footer />
    </Box>
  );
}
