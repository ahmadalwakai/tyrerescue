'use client';

import {
  Box,
  Container,
  Flex,
  Heading,
  Link as ChakraLink,
  SimpleGrid,
  Text,
} from '@chakra-ui/react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { colorTokens } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { trackCallClick, trackWhatsAppClick } from '@/lib/analytics/gtag';

const colors = {
  bg: colorTokens.bg,
  surface: colorTokens.surface,
  card: colorTokens.card,
  accent: colorTokens.accent,
  textPrimary: colorTokens.text,
  textSecondary: colorTokens.muted,
  border: colorTokens.border,
};

const supportCards = [
  {
    title: 'Booking Help',
    body: 'Find or change a booking, check your technician status, or get help if your location details need updating.',
    href: '/tracking',
    label: 'Track a booking',
  },
  {
    title: 'Quotes and Pricing',
    body: 'See mobile fitting prices before you book. Your summary shows callout, tyre, fitting and distance costs before payment.',
    href: '/pricing-faq',
    label: 'Pricing FAQ',
  },
  {
    title: 'Tyres and Fitting',
    body: 'Get support choosing tyres, confirming your tyre size, arranging emergency replacement or booking scheduled fitting.',
    href: '/tyres',
    label: 'Browse tyres',
  },
  {
    title: 'Cancellations and Refunds',
    body: 'Read when refunds are available and how to request one with your booking reference.',
    href: '/refund-policy',
    label: 'Refund policy',
  },
];

const helpTopics = [
  {
    title: 'Before You Book',
    items: [
      'Have your registration number or tyre size ready if you know it.',
      'Use the quote page to confirm service availability for your postcode.',
      'Emergency and scheduled bookings may show different tyre options and times.',
    ],
  },
  {
    title: 'After You Book',
    items: [
      'Keep your phone available so the technician can confirm access and arrival details.',
      'Use tracking with your booking reference for live booking updates where available.',
      'Call us if the vehicle has moved, the locking wheel nut key is missing, or access is restricted.',
    ],
  },
  {
    title: 'Payment Support',
    items: [
      'Online card payments are processed securely through Stripe.',
      'Apple Pay and Google Pay may be available where supported by your device.',
      'If a payment fails, contact us before placing a duplicate booking.',
    ],
  },
];

const policyLinks = [
  { label: 'Terms of Service', href: '/terms-of-service' },
  { label: 'Privacy Policy', href: '/privacy-policy' },
  { label: 'Refund Policy', href: '/refund-policy' },
  { label: 'Cookie Policy', href: '/cookie-policy' },
  { label: 'Frequently Asked Questions', href: '/faq' },
  { label: 'Contact Page', href: '/contact' },
];

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <ChakraLink
      asChild
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      minH="48px"
      px={6}
      bg={colors.accent}
      color={colors.bg}
      borderRadius="6px"
      fontSize="15px"
      fontWeight="700"
      _hover={{ opacity: 0.9 }}
      transition="opacity 0.2s"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      <Link href={href}>{children}</Link>
    </ChakraLink>
  );
}

function SupportCard({ title, body, href, label }: { title: string; body: string; href: string; label: string }) {
  return (
    <Box bg={colors.card} borderWidth="1px" borderColor={colors.border} borderRadius="8px" p={6}>
      <Heading as="h2" fontSize="20px" fontWeight="700" color={colors.textPrimary} mb={3}>
        {title}
      </Heading>
      <Text fontSize="14px" lineHeight="1.7" color={colors.textSecondary} mb={5}>
        {body}
      </Text>
      <ChakraLink asChild color={colors.accent} fontSize="14px" fontWeight="700" _hover={{ opacity: 0.8 }}>
        <Link href={href}>{label}</Link>
      </ChakraLink>
    </Box>
  );
}

export function HelpContent() {
  return (
    <Box minH="100vh" display="flex" flexDirection="column" bg={colors.bg}>
      <Nav />
      <Box id="main-content" as="main" flex={1} py={{ base: 16, md: 24 }}>
        <Container maxW="6xl">
          <Box maxW="760px" mb={12}>
            <Text
              fontSize="11px"
              fontWeight="700"
              color={colors.accent}
              textTransform="uppercase"
              letterSpacing="0.15em"
              mb={4}
              style={anim.fadeUp('0.5s')}
            >
              Help Centre
            </Text>
            <Heading
              as="h1"
              fontSize={{ base: '34px', md: '56px' }}
              fontWeight="900"
              color={colors.textPrimary}
              letterSpacing="0"
              lineHeight="1"
              mb={5}
              style={anim.fadeUp('0.5s', '0.05s')}
            >
              Help with your Tyre Rescue booking
            </Heading>
            <Text fontSize={{ base: '16px', md: '18px' }} color={colors.textSecondary} lineHeight="1.8" style={anim.fadeUp('0.5s', '0.1s')}>
              Get support for mobile tyre fitting, emergency tyre replacement, payments, refunds and account questions. Our team is based in Glasgow and supports customers across our covered service areas.
            </Text>
          </Box>

          <Box bg={colors.surface} borderWidth="1px" borderColor={colors.border} borderRadius="8px" p={{ base: 6, md: 8 }} mb={12} style={anim.fadeUp('0.5s', '0.15s')}>
            <Flex direction={{ base: 'column', lg: 'row' }} gap={8} justify="space-between" align={{ base: 'flex-start', lg: 'center' }}>
              <Box maxW="620px">
                <Heading as="h2" fontSize={{ base: '24px', md: '32px' }} color={colors.textPrimary} mb={3}>
                  Need urgent help now?
                </Heading>
                <Text fontSize="15px" color={colors.textSecondary} lineHeight="1.8">
                  Call for emergency tyre help, booking changes, payment issues or support with an active job. Phone support is available 8am to midnight, every day.
                </Text>
              </Box>
              <Flex gap={3} wrap="wrap">
                <ChakraLink
                  href="tel:01412660690"
                  minH="48px"
                  px={6}
                  display="inline-flex"
                  alignItems="center"
                  justifyContent="center"
                  bg={colors.accent}
                  color={colors.bg}
                  borderRadius="6px"
                  fontSize="15px"
                  fontWeight="700"
                  _hover={{ opacity: 0.9 }}
                  onClick={() => trackCallClick('help_page')}
                >
                  Call 0141 266 0690
                </ChakraLink>
                <ChakraLink
                  href="https://wa.me/447423262955"
                  target="_blank"
                  rel="noopener noreferrer"
                  minH="48px"
                  px={6}
                  display="inline-flex"
                  alignItems="center"
                  justifyContent="center"
                  borderWidth="1px"
                  borderColor={colors.border}
                  color={colors.textPrimary}
                  borderRadius="6px"
                  fontSize="15px"
                  fontWeight="700"
                  _hover={{ borderColor: colors.accent, color: colors.accent }}
                  onClick={() => trackWhatsAppClick('help_page')}
                >
                  WhatsApp Support
                </ChakraLink>
              </Flex>
            </Flex>
          </Box>

          <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap={5} mb={14}>
            {supportCards.map((card, index) => (
              <Box key={card.title} style={anim.stagger('fadeUp', index, '0.35s', 0.05, 0.04)}>
                <SupportCard {...card} />
              </Box>
            ))}
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, lg: 3 }} gap={8} mb={14}>
            {helpTopics.map((topic) => (
              <Box key={topic.title}>
                <Heading as="h2" fontSize="22px" color={colors.textPrimary} mb={4}>
                  {topic.title}
                </Heading>
                <Flex direction="column" gap={3}>
                  {topic.items.map((item) => (
                    <Box key={item} borderBottomWidth="1px" borderColor={colors.border} pb={3}>
                      <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.7">
                        {item}
                      </Text>
                    </Box>
                  ))}
                </Flex>
              </Box>
            ))}
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, md: 2 }} gap={8} mb={14}>
            <Box>
              <Heading as="h2" fontSize="24px" color={colors.textPrimary} mb={4}>
                Business Details
              </Heading>
              <Flex direction="column" gap={3}>
                <Text fontSize="14px" color={colors.textSecondary}>Trading name: Tyre Rescue</Text>
                <Text fontSize="14px" color={colors.textSecondary}>Garage address: 3, 10 Gateside St, Glasgow G31 1PD</Text>
                <Text fontSize="14px" color={colors.textSecondary}>Phone: 0141 266 0690</Text>
                <Text fontSize="14px" color={colors.textSecondary}>Email: support@tyrerescue.uk</Text>
              </Flex>
            </Box>
            <Box>
              <Heading as="h2" fontSize="24px" color={colors.textPrimary} mb={4}>
                Useful Pages
              </Heading>
              <SimpleGrid columns={{ base: 1, sm: 2 }} gap={3}>
                {policyLinks.map((link) => (
                  <ChakraLink
                    key={link.href}
                    asChild
                    color={colors.textSecondary}
                    fontSize="14px"
                    borderWidth="1px"
                    borderColor={colors.border}
                    borderRadius="6px"
                    px={4}
                    py={3}
                    _hover={{ color: colors.accent, borderColor: colors.accent }}
                  >
                    <Link href={link.href}>{link.label}</Link>
                  </ChakraLink>
                ))}
              </SimpleGrid>
            </Box>
          </SimpleGrid>

          <Box borderTopWidth="1px" borderColor={colors.border} pt={8}>
            <Flex direction={{ base: 'column', md: 'row' }} gap={4} align={{ base: 'stretch', md: 'center' }} justify="space-between">
              <Box>
                <Heading as="h2" fontSize="24px" color={colors.textPrimary} mb={2}>
                  Ready to book?
                </Heading>
                <Text fontSize="14px" color={colors.textSecondary}>
                  Start a quote online or contact us first if you need help choosing the right service.
                </Text>
              </Box>
              <Flex gap={3} wrap="wrap">
                <PrimaryLink href="/quote">Get a Quote</PrimaryLink>
                <PrimaryLink href="/contact">Contact Us</PrimaryLink>
              </Flex>
            </Flex>
          </Box>
        </Container>
      </Box>
      <Footer />
    </Box>
  );
}
