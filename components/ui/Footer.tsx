'use client';

import { useState, useEffect } from 'react';
import { Box, Container, Flex, Text, Link as ChakraLink, SimpleGrid } from '@chakra-ui/react';
import Link from 'next/link';
import { colorTokens } from '@/lib/design-tokens';
import { cities } from '@/lib/cities';

const colors = {
  bg: colorTokens.bg,
  textPrimary: colorTokens.text,
  textSecondary: colorTokens.muted,
  border: colorTokens.border,
};

const footerLinks = {
  about: [
    { label: 'Home', href: '/' },
    { label: 'Contact', href: '/contact' },
    { label: 'FAQ', href: '/faq' },
  ],
  navigation: [
    { label: 'Book a Fitting', href: '/book' },
    { label: 'Emergency', href: '/emergency' },
    { label: 'Browse Tyres', href: '/tyres' },
    { label: 'Track Booking', href: '/tracking' },
  ],
  services: [
    { label: 'Emergency Callout', href: '/emergency' },
    { label: 'Tyre Fitting', href: '/book' },
    { label: 'Puncture Repair', href: '/book' },
    { label: 'Tyre Sales', href: '/tyres' },
  ],
  legal: [
    { label: 'Privacy Policy', href: '/privacy-policy' },
    { label: 'Terms of Service', href: '/terms-of-service' },
    { label: 'Refund Policy', href: '/refund-policy' },
    { label: 'Cookie Policy', href: '/cookie-policy' },
  ],
};

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <Box>
      <Text
        fontSize="11px"
        fontWeight="500"
        color={colors.textSecondary}
        textTransform="uppercase"
        letterSpacing="0.15em"
        mb={4}
        style={{ fontFamily: 'var(--font-body)' }}
      >
        {title}
      </Text>
      <Flex direction="column" gap={3}>
        {links.map((link) => (
          <ChakraLink
            key={link.href + link.label}
            asChild
            fontSize="13px"
            color={colors.textSecondary}
            _hover={{ color: colors.textPrimary }}
            transition="color 0.2s"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            <Link href={link.href}>{link.label}</Link>
          </ChakraLink>
        ))}
      </Flex>
    </Box>
  );
}

export function Footer() {
  const [vatInfo, setVatInfo] = useState<{ vatRegistered: boolean; vatNumber: string } | null>(null);

  useEffect(() => {
    fetch('/api/public/settings')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setVatInfo(data); })
      .catch(() => {});
  }, []);

  return (
    <Box as="footer" bg={colors.bg} borderTopWidth="1px" borderColor={colors.border} mt="auto">
      <Container maxW="7xl" py="80px">
        {/* Top row */}
        <Flex
          justify="space-between"
          align={{ base: 'flex-start', md: 'center' }}
          direction={{ base: 'column', md: 'row' }}
          gap={4}
          mb="60px"
        >
          <Text
            fontSize={{ base: '32px', md: '48px' }}
            color={colors.textPrimary}
            lineHeight="1"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            TYRE RESCUE
          </Text>
          <Text
            fontSize="13px"
            color={colors.textSecondary}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Emergency mobile tyre fitting — Glasgow &amp; Edinburgh
          </Text>
        </Flex>

        {/* Five columns */}
        <SimpleGrid columns={{ base: 2, md: 5 }} gap={12} mb="60px">
          <FooterColumn title="About" links={footerLinks.about} />
          <FooterColumn title="Navigation" links={footerLinks.navigation} />
          <FooterColumn title="Services" links={footerLinks.services} />
          <FooterColumn title="Legal" links={footerLinks.legal} />
          <Box>
            <Text
              fontSize="11px"
              fontWeight="500"
              color={colors.textSecondary}
              textTransform="uppercase"
              letterSpacing="0.1em"
              mb={4}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              AREAS WE COVER
            </Text>
            <Flex direction="column" gap={2}>
              {cities.slice(0, 8).map((city) => (
                <ChakraLink
                  key={city.slug}
                  asChild
                  fontSize="13px"
                  color={colors.textSecondary}
                  _hover={{ color: colors.textPrimary }}
                  transition="color 0.2s"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  <Link href={`/services/${city.slug}`}>{city.name}</Link>
                </ChakraLink>
              ))}
            </Flex>
          </Box>
        </SimpleGrid>

        {/* Bottom bar */}
        <Box pt={8} borderTopWidth="1px" borderColor={colors.border}>
          <Flex
            direction={{ base: 'column', md: 'row' }}
            justify="space-between"
            align="center"
            gap={4}
          >
            <Text
              fontSize="11px"
              color={colors.textSecondary}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              © {new Date().getFullYear()} Tyre Rescue. All rights reserved.
            </Text>
            {vatInfo?.vatRegistered && vatInfo.vatNumber && (
              <Text
                fontSize="11px"
                color={colors.textSecondary}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                VAT Reg: {vatInfo.vatNumber}
              </Text>
            )}
          </Flex>
        </Box>
      </Container>
    </Box>
  );
}
