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

export function TermsContent() {
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
            Terms of Service
          </Heading>
          <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8" mb={6} style={anim.fadeUp('0.5s', '0.1s')}>
            These terms of service govern your use of the Tyre Rescue website and mobile tyre fitting service. By using our service, you agree to these terms.
          </Text>
          <Animated animation={anim.fadeUp('0.5s')}>
            <Heading as="h2" fontSize="20px" fontWeight="600" color={colors.textPrimary} mb={4} mt={8}>
              Service Description
            </Heading>
            <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8" mb={6}>
              Tyre Rescue provides mobile tyre fitting, emergency callout, and puncture repair services across Glasgow, Edinburgh, and surrounding areas. Services are subject to availability and location coverage.
            </Text>
          </Animated>
          <Animated animation={anim.fadeUp('0.5s')}>
            <Heading as="h2" fontSize="20px" fontWeight="600" color={colors.textPrimary} mb={4} mt={8}>
              Booking and Payment
            </Heading>
            <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8" mb={6}>
              All bookings are confirmed upon successful payment. Prices include VAT unless stated otherwise. Payment is processed securely through Stripe at the time of booking.
            </Text>
          </Animated>
          <Animated animation={anim.fadeUp('0.5s')}>
            <Heading as="h2" fontSize="20px" fontWeight="600" color={colors.textPrimary} mb={4} mt={8}>
              Cancellation
            </Heading>
            <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8">
              Cancellations made more than 2 hours before the scheduled appointment are eligible for a full refund. See our Refund Policy for details.
            </Text>
          </Animated>
        </Container>
      </Box>
      <Footer />
    </Box>
  );
}
