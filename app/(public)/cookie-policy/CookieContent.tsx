'use client';

import { Box, Container, Heading, Text, Flex } from '@chakra-ui/react';
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
  accent: colorTokens.accent,
  card: colorTokens.card,
  surface: colorTokens.surface,
};

interface CookieRow {
  name: string;
  purpose: string;
  provider: string;
  duration: string;
  category: 'Essential' | 'Analytics' | 'Marketing';
}

const cookieTable: CookieRow[] = [
  { name: 'authjs.session-token', purpose: 'User login session', provider: 'Tyre Rescue', duration: 'Session', category: 'Essential' },
  { name: 'authjs.csrf-token', purpose: 'Security protection', provider: 'Tyre Rescue', duration: 'Session', category: 'Essential' },
  { name: 'tyrerescue_consent_v2', purpose: 'Your cookie preferences', provider: 'Tyre Rescue', duration: '1 year', category: 'Essential' },
  { name: '_ga', purpose: 'Visitor identification', provider: 'Google Analytics', duration: '2 years', category: 'Analytics' },
  { name: '_ga_XXXXXXXX', purpose: 'Session tracking', provider: 'Google Analytics', duration: '2 years', category: 'Analytics' },
  { name: '_clck', purpose: 'Clarity visitor ID', provider: 'Microsoft Clarity', duration: '1 year', category: 'Analytics' },
  { name: '_clsk', purpose: 'Clarity session', provider: 'Microsoft Clarity', duration: '1 day', category: 'Analytics' },
  { name: '_fbp', purpose: 'Facebook Pixel tracking', provider: 'Meta', duration: '3 months', category: 'Marketing' },
];

const categoryColor: Record<string, string> = {
  Essential: '#22C55E',
  Analytics: '#3B82F6',
  Marketing: '#A855F7',
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
            <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8" mb={6}>
              With your consent, we use analytics cookies (Google Analytics and Microsoft Clarity) to understand how visitors use our site. This data is anonymised and helps us improve the service.
            </Text>
          </Animated>
          <Animated animation={anim.fadeUp('0.5s')}>
            <Heading as="h2" fontSize="20px" fontWeight="600" color={colors.textPrimary} mb={4} mt={8}>
              Marketing Cookies
            </Heading>
            <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.8" mb={6}>
              With your consent, we use the Meta Pixel to measure the effectiveness of our advertising. We never sell your personal data.
            </Text>
          </Animated>

          {/* Cookie table */}
          <Animated animation={anim.fadeUp('0.5s')}>
            <Heading as="h2" fontSize="20px" fontWeight="600" color={colors.textPrimary} mb={4} mt={8}>
              Cookies We Use
            </Heading>

            {/* Desktop table */}
            <Box
              display={{ base: 'none', md: 'block' }}
              borderWidth="1px"
              borderColor={colors.border}
              borderRadius="8px"
              overflow="hidden"
            >
              <Box as="table" w="100%" style={{ borderCollapse: 'collapse' }}>
                <Box as="thead">
                  <Box as="tr" bg={colors.surface}>
                    {['Cookie Name', 'Purpose', 'Provider', 'Duration', 'Category'].map((h) => (
                      <Box
                        key={h}
                        as="th"
                        textAlign="left"
                        px={4}
                        py={3}
                        color={colors.textSecondary}
                        fontSize="12px"
                        fontWeight="600"
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        {h}
                      </Box>
                    ))}
                  </Box>
                </Box>
                <Box as="tbody">
                  {cookieTable.map((row) => (
                    <Box
                      key={row.name}
                      as="tr"
                      borderTopWidth="1px"
                      borderColor={colors.border}
                    >
                      <Box as="td" px={4} py={3} color={colors.textPrimary} fontSize="13px" fontWeight="500" style={{ fontFamily: 'var(--font-body)' }}>
                        {row.name}
                      </Box>
                      <Box as="td" px={4} py={3} color={colors.textSecondary} fontSize="13px" style={{ fontFamily: 'var(--font-body)' }}>
                        {row.purpose}
                      </Box>
                      <Box as="td" px={4} py={3} color={colors.textSecondary} fontSize="13px" style={{ fontFamily: 'var(--font-body)' }}>
                        {row.provider}
                      </Box>
                      <Box as="td" px={4} py={3} color={colors.textSecondary} fontSize="13px" style={{ fontFamily: 'var(--font-body)' }}>
                        {row.duration}
                      </Box>
                      <Box as="td" px={4} py={3}>
                        <Box
                          as="span"
                          display="inline-block"
                          px="8px"
                          py="2px"
                          borderRadius="4px"
                          fontSize="11px"
                          fontWeight="600"
                          color="#09090B"
                          bg={categoryColor[row.category]}
                          style={{ fontFamily: 'var(--font-body)' }}
                        >
                          {row.category}
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>

            {/* Mobile cards */}
            <Flex
              display={{ base: 'flex', md: 'none' }}
              direction="column"
              gap={3}
            >
              {cookieTable.map((row) => (
                <Box
                  key={row.name}
                  bg={colors.card}
                  borderWidth="1px"
                  borderColor={colors.border}
                  borderRadius="8px"
                  p={4}
                >
                  <Flex justify="space-between" align="center" mb={2}>
                    <Text color={colors.textPrimary} fontSize="13px" fontWeight="600" style={{ fontFamily: 'var(--font-body)' }}>
                      {row.name}
                    </Text>
                    <Box
                      as="span"
                      px="8px"
                      py="2px"
                      borderRadius="4px"
                      fontSize="10px"
                      fontWeight="600"
                      color="#09090B"
                      bg={categoryColor[row.category]}
                      flexShrink={0}
                      style={{ fontFamily: 'var(--font-body)' }}
                    >
                      {row.category}
                    </Box>
                  </Flex>
                  <Text color={colors.textSecondary} fontSize="12px" style={{ fontFamily: 'var(--font-body)' }}>
                    {row.purpose}
                  </Text>
                  <Flex gap={3} mt={2}>
                    <Text color={colors.textSecondary} fontSize="11px" style={{ fontFamily: 'var(--font-body)' }}>
                      {row.provider}
                    </Text>
                    <Text color={colors.textSecondary} fontSize="11px" style={{ fontFamily: 'var(--font-body)' }}>
                      {row.duration}
                    </Text>
                  </Flex>
                </Box>
              ))}
            </Flex>
          </Animated>

          {/* Manage preferences button */}
          <Animated animation={anim.fadeUp('0.5s')}>
            <Box mt={10}>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('tyrerescue_consent_v2');
                  window.dispatchEvent(new CustomEvent('cookie-consent-reset'));
                }}
                style={{
                  background: colorTokens.accent,
                  color: '#09090B',
                  border: 'none',
                  borderRadius: 6,
                  height: 48,
                  padding: '0 24px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-display)',
                  fontSize: 18,
                }}
              >
                MANAGE COOKIE PREFERENCES
              </button>
            </Box>
          </Animated>
        </Container>
      </Box>
      <Footer />
    </Box>
  );
}
