'use client';

import {
  Box,
  Container,
  SimpleGrid,
  Heading,
  Text,
  Flex,
  Link as ChakraLink,
} from '@chakra-ui/react';
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

const contactMethods = [
  {
    label: 'Phone',
    title: '0141 266 0690',
    body: 'Fastest option for emergency tyre help, active bookings and same-day support.',
    href: 'tel:01412660690',
    action: 'Call now',
  },
  {
    label: 'Email',
    title: 'support@tyrerescue.uk',
    body: 'Best for receipts, refund requests, account help and non-urgent booking questions.',
    href: 'mailto:support@tyrerescue.uk',
    action: 'Email support',
  },
  {
    label: 'WhatsApp',
    title: '07423 262955',
    body: 'Send photos, tyre sizes or location details when our team asks for more information.',
    href: 'https://wa.me/447423262955',
    action: 'Open WhatsApp',
  },
];

const supportTopics = [
  'Emergency mobile tyre fitting',
  'Scheduled mobile tyre fitting',
  'Booking changes and cancellations',
  'Payment or receipt questions',
  'Refund requests',
  'Help choosing the correct tyre size',
];

const usefulLinks = [
  { label: 'Help Centre', href: '/help' },
  { label: 'Frequently Asked Questions', href: '/faq' },
  { label: 'Refund Policy', href: '/refund-policy' },
  { label: 'Terms of Service', href: '/terms-of-service' },
  { label: 'Privacy Policy', href: '/privacy-policy' },
  { label: 'Cookie Policy', href: '/cookie-policy' },
];

export function ContactContent() {
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
              Contact Tyre Rescue
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
            Contact our mobile tyre fitting team
          </Heading>
          <Text fontSize={{ base: '16px', md: '18px' }} color={colors.textSecondary} lineHeight="1.8" style={anim.fadeUp('0.5s', '0.1s')}>
            Speak to Tyre Rescue about emergency tyre replacement, scheduled mobile tyre fitting, booking support, payments, cancellations or refunds. Phone support is available 8am to midnight, every day.
          </Text>
          </Box>

          <Box bg={colors.surface} borderWidth="1px" borderColor={colors.border} borderRadius="8px" p={{ base: 6, md: 8 }} mb={12} style={anim.fadeUp('0.5s', '0.15s')}>
            <Flex direction={{ base: 'column', lg: 'row' }} gap={8} justify="space-between" align={{ base: 'flex-start', lg: 'center' }}>
              <Box maxW="620px">
                <Heading as="h2" fontSize={{ base: '24px', md: '32px' }} color={colors.textPrimary} mb={3}>
                  Need help on the road?
                </Heading>
                <Text fontSize="15px" color={colors.textSecondary} lineHeight="1.8">
                  Call us first for urgent tyre support. If you already have a booking, keep your booking reference ready so we can find it quickly.
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
                  onClick={() => trackCallClick('contact_page_urgent')}
                >
                  Call 0141 266 0690
                </ChakraLink>
                <ChakraLink
                  asChild
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
                >
                  <Link href="/tracking">Track Booking</Link>
                </ChakraLink>
              </Flex>
            </Flex>
          </Box>

          <SimpleGrid columns={{ base: 1, md: 3 }} gap={5} mb={14}>
            {contactMethods.map((method, index) => (
              <Box key={method.label} bg={colors.card} p={6} borderRadius="8px" borderWidth="1px" borderColor={colors.border} style={anim.stagger('fadeUp', index, '0.35s', 0.1, 0.05)}>
                <Text fontSize="11px" fontWeight="700" color={colors.textSecondary} textTransform="uppercase" letterSpacing="0.15em" mb={4}>
                  {method.label}
                </Text>
                <Heading as="h2" fontSize="22px" color={colors.textPrimary} mb={3}>
                  {method.title}
                </Heading>
                <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.7" mb={5}>
                  {method.body}
                </Text>
                <ChakraLink
                  href={method.href}
                  target={method.label === 'WhatsApp' ? '_blank' : undefined}
                  rel={method.label === 'WhatsApp' ? 'noopener noreferrer' : undefined}
                  color={colors.accent}
                  fontSize="14px"
                  fontWeight="700"
                  _hover={{ opacity: 0.8 }}
                  onClick={() => {
                    if (method.label === 'Phone') trackCallClick('contact_page_card');
                    if (method.label === 'WhatsApp') trackWhatsAppClick('contact_page_card');
                  }}
                >
                  {method.action}
                </ChakraLink>
              </Box>
            ))}
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, lg: 2 }} gap={10} mb={14}>
            <Box>
              <Heading as="h2" fontSize="24px" color={colors.textPrimary} mb={5}>
                Business Details
              </Heading>
              <Flex direction="column" gap={4}>
                <Box borderBottomWidth="1px" borderColor={colors.border} pb={4}>
                  <Text fontSize="13px" color={colors.textSecondary} mb={1}>Trading name</Text>
                  <Text fontSize="16px" color={colors.textPrimary}>Tyre Rescue</Text>
                </Box>
                <Box borderBottomWidth="1px" borderColor={colors.border} pb={4}>
                  <Text fontSize="13px" color={colors.textSecondary} mb={1}>Garage address</Text>
                  <Text fontSize="16px" color={colors.textPrimary}>3, 10 Gateside St, Glasgow G31 1PD</Text>
                </Box>
                <Box borderBottomWidth="1px" borderColor={colors.border} pb={4}>
                  <Text fontSize="13px" color={colors.textSecondary} mb={1}>Opening hours</Text>
                  <Text fontSize="16px" color={colors.textPrimary}>8am to midnight, every day</Text>
                </Box>
                <Box>
                  <Text fontSize="13px" color={colors.textSecondary} mb={1}>Service areas</Text>
                  <Text fontSize="16px" color={colors.textPrimary}>Glasgow, Edinburgh and covered areas across Central Scotland</Text>
                </Box>
              </Flex>
            </Box>

            <Box>
              <Heading as="h2" fontSize="24px" color={colors.textPrimary} mb={5}>
                What We Can Help With
              </Heading>
              <SimpleGrid columns={{ base: 1, sm: 2 }} gap={3}>
                {supportTopics.map((topic) => (
                  <Box key={topic} borderWidth="1px" borderColor={colors.border} borderRadius="6px" p={4}>
                    <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.6">
                      {topic}
                    </Text>
                  </Box>
                ))}
              </SimpleGrid>
            </Box>
          </SimpleGrid>

          <Box borderTopWidth="1px" borderColor={colors.border} pt={8}>
            <Flex direction={{ base: 'column', lg: 'row' }} gap={8} justify="space-between" align={{ base: 'stretch', lg: 'flex-start' }}>
              <Box maxW="520px">
                <Heading as="h2" fontSize="24px" color={colors.textPrimary} mb={3}>
                  Useful Pages
                </Heading>
                <Text fontSize="14px" color={colors.textSecondary} lineHeight="1.7">
                  Find policy information, booking help and answers to common questions before you contact us.
                </Text>
              </Box>
              <SimpleGrid columns={{ base: 1, sm: 2 }} gap={3} minW={{ lg: '460px' }}>
                {usefulLinks.map((link) => (
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
            </Flex>
          </Box>
        </Container>
      </Box>
      <Footer />
    </Box>
  );
}
