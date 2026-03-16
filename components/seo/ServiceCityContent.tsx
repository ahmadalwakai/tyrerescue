'use client';

import {
  Box,
  Container,
  Text,
  Flex,
  SimpleGrid,
  Link as ChakraLink,
} from '@chakra-ui/react';
import Link from 'next/link';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { FloatingContactBar } from '@/components/ui/FloatingContactBar';
import { colorTokens } from '@/lib/design-tokens';
import type { ServiceSEO, Area } from '@/lib/areas';
import type { City } from '@/lib/cities';
import { services } from '@/lib/areas';

const c = colorTokens;

const serviceDescriptions: Record<string, (city: string) => string> = {
  'mobile-tyre-fitting': (city) =>
    `Our mobile tyre fitting service in ${city} brings the garage to you. Whether you are at home, at work, or stranded at the roadside, our certified fitters come to your exact location with everything needed to fit your new tyres on the spot.`,
  'emergency-tyre-fitting': (city) =>
    `When you have a flat tyre emergency in ${city}, every minute counts. Our emergency response team is available 24 hours a day and typically arrives within 45 minutes. Do not wait for a recovery truck — call us and we come to you.`,
  'tyre-repair': (city) =>
    `Not every flat tyre needs a replacement. Our mobile tyre repair service in ${city} can fix many types of tyre damage on the spot, saving you the cost of a new tyre. Our fitters assess the damage and advise you on the best course of action.`,
  'puncture-repair': (city) =>
    `A puncture does not have to ruin your day. Our mobile puncture repair service in ${city} can fix most standard punctures at your location in under an hour. Nail in your tyre? Slow puncture? Call us and we come to you.`,
  'tyre-fitting': (city) =>
    `Need new tyres in ${city}? Our mobile tyre fitting service stocks a wide range of budget, mid-range and premium tyres. We come to your home or workplace and fit your new tyres while you carry on with your day.`,
};

export function ServiceCityContent({ service, city, areas }: { service: ServiceSEO; city: City; areas: Area[] }) {
  const otherServices = services.filter((s) => s.slug !== service.slug);

  return (
    <Box minH="100vh" display="flex" flexDirection="column" bg={c.bg}>
      <Nav />
      <Box as="main" flex={1}>

        {/* ── HERO ── */}
        <Box bg={c.bg} py={{ base: '80px', md: '120px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
            <Text
              fontSize="11px"
              color={c.accent}
              letterSpacing="0.15em"
              mb={6}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {service.name.toUpperCase()}
            </Text>
            <Text
              as="h1"
              fontSize={{ base: '52px', md: '80px', lg: '100px' }}
              lineHeight="0.95"
              color={c.text}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {service.h1Template.replace('{location}', city.name).toUpperCase()}.
            </Text>
            <Text
              fontSize="17px"
              color={c.muted}
              maxW="520px"
              lineHeight="1.6"
              mt={6}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {service.heroText.replace('{location}', city.name)}
            </Text>

            <Flex gap={3} mt={10} direction={{ base: 'column', md: 'row' }} flexWrap="wrap">
              <ChakraLink
                asChild
                px={10} h="56px" display="inline-flex" alignItems="center" justifyContent="center"
                bg={c.accent} color={c.bg} fontSize="20px" letterSpacing="0.05em" borderRadius="4px"
                w={{ base: '100%', md: 'auto' }} _hover={{ opacity: 0.9 }}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <Link href="/emergency">EMERGENCY CALLOUT</Link>
              </ChakraLink>
              <ChakraLink
                asChild
                px={10} h="56px" display="inline-flex" alignItems="center" justifyContent="center"
                bg="transparent" color={c.text} fontSize="20px" letterSpacing="0.05em" borderRadius="4px"
                borderWidth="1px" borderColor={c.border} w={{ base: '100%', md: 'auto' }}
                _hover={{ borderColor: c.accent, color: c.accent }}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <Link href="/book">SCHEDULE A FITTING</Link>
              </ChakraLink>
              <ChakraLink
                href="tel:01412660690"
                px={10} h="56px" display="inline-flex" alignItems="center" justifyContent="center"
                bg="transparent" color={c.accent} fontSize="20px" letterSpacing="0.05em" borderRadius="4px"
                borderWidth="1px" borderColor={c.accent} w={{ base: '100%', md: 'auto' }}
                _hover={{ bg: 'rgba(249,115,22,0.08)' }}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                CALL 0141 266 0690
              </ChakraLink>
            </Flex>

            <Flex mt={12} gap={{ base: 6, md: 0 }} wrap="wrap">
              <Box pr={{ base: 4, md: 8 }}>
                <Text fontSize={{ base: '32px', md: '48px' }} color={c.text} lineHeight="1" style={{ fontFamily: 'var(--font-display)' }}>45 MIN</Text>
                <Text fontSize="12px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>Avg Response</Text>
              </Box>
              <Box borderLeftWidth="1px" borderRightWidth="1px" borderColor={c.border} px={{ base: 4, md: 8 }}>
                <Text fontSize={{ base: '32px', md: '48px' }} color={c.accent} lineHeight="1" style={{ fontFamily: 'var(--font-display)' }}>24/7</Text>
                <Text fontSize="12px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>Availability</Text>
              </Box>
              <Box pl={{ base: 4, md: 8 }}>
                <Text fontSize={{ base: '32px', md: '48px' }} color={c.text} lineHeight="1" style={{ fontFamily: 'var(--font-display)' }}>4.8</Text>
                <Text fontSize="12px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>Google Rating</Text>
              </Box>
            </Flex>
          </Container>
        </Box>

        {/* ── AREAS WE COVER ── */}
        {areas.length > 0 && (
          <Box bg={c.surface} py={{ base: '60px', md: '80px' }} px={{ base: 4, md: 8 }}>
            <Container maxW="1200px">
              <Text
                as="h2"
                fontSize={{ base: '36px', md: '48px' }}
                color={c.text}
                mb={6}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {service.name.toUpperCase()} ACROSS {city.name.toUpperCase()}
              </Text>
              <Text
                fontSize="15px"
                color={c.muted}
                lineHeight="1.7"
                maxW="640px"
                mb={8}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                We provide {service.name.toLowerCase()} throughout {city.name} and all surrounding areas.
                Our mobile fitters cover every postcode in {city.county}.
              </Text>
              <Flex gap={2} wrap="wrap">
                {areas.map((area) => (
                  <ChakraLink
                    key={area.slug}
                    asChild
                    bg={c.card}
                    borderWidth="1px"
                    borderColor={c.border}
                    borderRadius="4px"
                    px={4}
                    py={2}
                    _hover={{ borderColor: c.accent, color: c.accent }}
                    transition="all 0.2s"
                  >
                    <Link href={`/${service.slug}/${city.slug}/${area.slug}`}>
                      <Text fontSize="13px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }} _hover={{ color: c.accent }}>
                        {area.name}
                      </Text>
                    </Link>
                  </ChakraLink>
                ))}
              </Flex>
            </Container>
          </Box>
        )}

        {/* ── SERVICE DESCRIPTION ── */}
        <Box bg={c.bg} py={{ base: '60px', md: '80px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
            <Text
              as="h2"
              fontSize={{ base: '36px', md: '48px' }}
              color={c.text}
              mb={6}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              OUR {service.name.toUpperCase()} SERVICE
            </Text>
            <Text
              fontSize="15px"
              color={c.muted}
              lineHeight="1.8"
              maxW="640px"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {serviceDescriptions[service.slug]?.(city.name) ?? service.heroText.replace('{location}', city.name)}
            </Text>
          </Container>
        </Box>

        {/* ── PRICE & BOOKING ── */}
        <Box bg={c.surface} py={{ base: '60px', md: '80px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
            <Text
              as="h2"
              fontSize={{ base: '36px', md: '48px' }}
              color={c.text}
              mb={4}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {service.name.toUpperCase()} PRICE {city.name.toUpperCase()}
            </Text>
            <Text
              fontSize={{ base: '48px', md: '64px' }}
              color={c.accent}
              lineHeight="1"
              mb={4}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {service.priceFrom.toUpperCase()}
            </Text>
            <Text fontSize="14px" color={c.muted} mb={8} style={{ fontFamily: 'var(--font-body)' }}>
              Price includes labour. Tyre cost extra if applicable.
            </Text>
            <ChakraLink
              asChild
              px={10} h="56px" display="inline-flex" alignItems="center" justifyContent="center"
              bg={c.accent} color={c.bg} fontSize="20px" letterSpacing="0.05em" borderRadius="4px"
              w={{ base: '100%', md: 'auto' }} _hover={{ opacity: 0.9 }}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              <Link href="/book">BOOK NOW</Link>
            </ChakraLink>
          </Container>
        </Box>

        {/* ── RELATED SERVICES ── */}
        <Box bg={c.bg} py={{ base: '60px', md: '80px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
            <Text
              as="h2"
              fontSize={{ base: '36px', md: '48px' }}
              color={c.text}
              mb={8}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              OTHER SERVICES IN {city.name.toUpperCase()}
            </Text>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={4}>
              {otherServices.map((s) => (
                <ChakraLink
                  key={s.slug}
                  asChild
                  bg={c.card}
                  borderWidth="1px"
                  borderColor={c.border}
                  borderRadius="8px"
                  p={5}
                  _hover={{ borderColor: c.accent }}
                  transition="border-color 0.2s"
                  textDecoration="none"
                >
                  <Link href={`/${s.slug}/${city.slug}`}>
                    <Text fontSize={{ base: '18px', md: '20px' }} color={c.text} mb={2} style={{ fontFamily: 'var(--font-display)' }}>
                      {s.name}
                    </Text>
                    <Text fontSize="16px" color={c.accent} style={{ fontFamily: 'var(--font-display)' }}>
                      {s.priceFrom}
                    </Text>
                  </Link>
                </ChakraLink>
              ))}
            </SimpleGrid>
          </Container>
        </Box>

        {/* ── CTA ── */}
        <Box bg={c.accent} py={{ base: '60px', md: '80px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px" textAlign="center">
            <Text
              fontSize={{ base: '36px', md: '64px' }}
              color={c.bg}
              lineHeight="0.95"
              mb={6}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              NEED {service.name.toUpperCase()} IN {city.name.toUpperCase()}?
            </Text>
            <ChakraLink
              href="tel:01412660690"
              display="inline-block"
              fontSize={{ base: '28px', md: '48px' }}
              color={c.bg}
              mb={4}
              _hover={{ opacity: 0.7 }}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              CALL 0141 266 0690
            </ChakraLink>
            <Flex direction={{ base: 'column', sm: 'row' }} gap={4} justify="center" mt={6}>
              <ChakraLink
                href="tel:01412660690"
                px={8} py={4} bg={c.bg} color={c.accent}
                fontSize="18px" letterSpacing="0.05em" borderRadius="4px"
                textAlign="center" w={{ base: '100%', sm: 'auto' }}
                minH="48px" display="inline-flex" alignItems="center" justifyContent="center"
                _hover={{ opacity: 0.9 }}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                CALL NOW
              </ChakraLink>
              <ChakraLink
                asChild
                px={8} py={4} bg="transparent" color={c.bg}
                fontSize="18px" letterSpacing="0.05em" borderRadius="4px"
                borderWidth="2px" borderColor={c.bg}
                textAlign="center" w={{ base: '100%', sm: 'auto' }}
                minH="48px" display="inline-flex" alignItems="center" justifyContent="center"
                _hover={{ bg: 'rgba(10,10,10,0.1)' }}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <Link href="/book">BOOK ONLINE</Link>
              </ChakraLink>
            </Flex>
          </Container>
        </Box>
      </Box>
      <Footer />
      <FloatingContactBar />
    </Box>
  );
}
