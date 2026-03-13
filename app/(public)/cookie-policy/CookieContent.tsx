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

export function CookieContent() {
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
            Cookie Policy
          </Heading>
          <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8" mb={6} style={anim.fadeUp('0.5s', '0.1s')}>
            This policy explains how Tyre Rescue uses cookies and similar technologies on our website.
          </Text>
          <Animated animation={anim.fadeUp('0.5s')}>
            <Heading as="h2" fontSize="20px" fontWeight="600" color={colors.textPrimary} mb={4} mt={8}>
              What Are Cookies
            </Heading>
            <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8" mb={6}>
              Cookies are small text files stored on your device when you visit our website. They help us provide a better experience and understand how the site is used.
            </Text>
          </Animated>
          <Animated animation={anim.fadeUp('0.5s')}>
            <Heading as="h2" fontSize="20px" fontWeight="600" color={colors.textPrimary} mb={4} mt={8}>
              Essential Cookies
            </Heading>
            <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8" mb={6}>
              We use essential cookies for authentication, session management, and payment processing. These are necessary for the service to function and cannot be disabled.
            </Text>
          </Animated>
          <Animated animation={anim.fadeUp('0.5s')}>
            <Heading as="h2" fontSize="20px" fontWeight="600" color={colors.textPrimary} mb={4} mt={8}>
              Analytics Cookies
            </Heading>
            <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8">
              We may use analytics cookies to understand how visitors use our site. This data is anonymised and helps us improve the service.
            </Text>
          </Animated>
        </Container>
      </Box>
      <Footer />
    </Box>
  );
}
