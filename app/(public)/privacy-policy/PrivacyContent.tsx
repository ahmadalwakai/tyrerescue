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

export function PrivacyContent() {
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
            Privacy Policy
          </Heading>
          <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8" mb={6} style={anim.fadeUp('0.5s', '0.1s')}>
            This privacy policy explains how Tyre Rescue (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) collects, uses, and protects your personal information when you use our website and services.
          </Text>
          <Animated animation={anim.fadeUp('0.5s')}>
            <Heading as="h2" fontSize="20px" fontWeight="600" color={colors.textPrimary} mb={4} mt={8}>
              Information We Collect
            </Heading>
            <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8" mb={6}>
              We collect information you provide directly, including your name, email address, phone number, vehicle details, and location data when you book our services. We also collect payment information securely processed through Stripe.
            </Text>
          </Animated>
          <Animated animation={anim.fadeUp('0.5s')}>
            <Heading as="h2" fontSize="20px" fontWeight="600" color={colors.textPrimary} mb={4} mt={8}>
              How We Use Your Information
            </Heading>
            <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8" mb={6}>
              We use your information to provide our tyre fitting service, process payments, send booking confirmations and updates, and improve our services. We do not sell your personal data to third parties.
            </Text>
          </Animated>
          <Animated animation={anim.fadeUp('0.5s')}>
            <Heading as="h2" fontSize="20px" fontWeight="600" color={colors.textPrimary} mb={4} mt={8}>
              Contact
            </Heading>
            <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8">
              For questions about this privacy policy, contact us at support@tyrerescue.uk or call 0141 266 0690.
            </Text>
          </Animated>
        </Container>
      </Box>
      <Footer />
    </Box>
  );
}
