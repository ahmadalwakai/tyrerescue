'use client';

import {
  Box,
  Container,
  Text,
  Flex,
  Link as ChakraLink,
} from '@chakra-ui/react';
import Link from 'next/link';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { FloatingContactBar } from '@/components/ui/FloatingContactBar';
import { colorTokens } from '@/lib/design-tokens';
import type { ServiceSEO, Area } from '@/lib/areas';
import { services } from '@/lib/areas';
import type { City } from '@/lib/cities';

const c = colorTokens;

export function ServiceAreaContent({ service, city, area, allCityAreas }: { service: ServiceSEO; city: City; area: Area; allCityAreas: Area[] }) {
  const estimatedArrival = Math.round(area.distanceFromCentre * 3.5 + 18);

  const nearbyAreas = allCityAreas
    .filter((a) => a.slug !== area.slug)
    .sort((a, b) =>
      Math.abs(a.distanceFromCentre - area.distanceFromCentre) -
      Math.abs(b.distanceFromCentre - area.distanceFromCentre)
    )
    .slice(0, 6);

  const otherServices = services.filter((s) => s.slug !== service.slug);

  return (
    <Box minH="100vh" display="flex" flexDirection="column" bg={c.bg}>
      <Nav />
      <Box as="main" flex={1}>

        {/* ── BREADCRUMB ── */}
        <Box bg={c.bg} pt={{ base: '80px', md: '100px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
            <Flex align="center" gap={2} flexWrap="wrap">
              <ChakraLink asChild fontSize="12px" color={c.muted} _hover={{ color: c.text }} style={{ fontFamily: 'var(--font-body)' }}>
                <Link href="/">Home</Link>
              </ChakraLink>
              <Text fontSize="12px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>/</Text>
              <ChakraLink asChild fontSize="12px" color={c.muted} _hover={{ color: c.text }} style={{ fontFamily: 'var(--font-body)' }}>
                <Link href={`/${service.slug}/${city.slug}`}>{city.name}</Link>
              </ChakraLink>
              <Text fontSize="12px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>/</Text>
              <Text fontSize="12px" color={c.accent} style={{ fontFamily: 'var(--font-body)' }}>{area.name}</Text>
            </Flex>
          </Container>
        </Box>

        {/* ── HERO ── */}
        <Box bg={c.bg} py={{ base: '40px', md: '80px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
            <Text
              fontSize="11px"
              color={c.accent}
              letterSpacing="0.15em"
              mb={6}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {service.name.toUpperCase()} — {area.postcode}
            </Text>
            <Text
              as="h1"
              fontSize={{ base: '44px', md: '72px', lg: '90px' }}
              lineHeight="0.95"
              color={c.text}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {service.name.toUpperCase()} IN {area.name.toUpperCase()}, {city.name.toUpperCase()}.
            </Text>
            <Text
              fontSize="17px"
              color={c.muted}
              maxW="520px"
              lineHeight="1.6"
              mt={6}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {service.name} in {area.name} ({area.postcode}). We typically reach customers near {area.nearestLandmark} in approximately {estimatedArrival} minutes from our Glasgow base. Available 24 hours a day, 7 days a week.
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
          </Container>
        </Box>

        {/* ── LOCAL KNOWLEDGE ── */}
        <Box bg={c.surface} py={{ base: '60px', md: '80px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
            <Text
              as="h2"
              fontSize={{ base: '36px', md: '48px' }}
              color={c.text}
              mb={6}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {service.name.toUpperCase()} NEAR {area.nearestLandmark.toUpperCase()}
            </Text>
            <Text
              fontSize="15px"
              color={c.muted}
              lineHeight="1.8"
              maxW="640px"
              mb={6}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Our {service.name.toLowerCase()} service covers {area.name} and the {area.postcode} postcode area. Whether you are near {area.nearestLandmark} or anywhere else in {area.name}, our mobile fitters can reach you. We are {area.distanceFromCentre.toFixed(1)} miles from {city.name} city centre.
            </Text>
            <Text
              fontSize="14px"
              color={c.muted}
              lineHeight="1.8"
              maxW="640px"
              mb={4}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Serving the {area.postcode} postcode area and surrounding streets.
            </Text>
            <Text
              fontSize="15px"
              color={c.muted}
              lineHeight="1.8"
              maxW="640px"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              We know {area.name} well. Our mobile tyre fitters regularly serve customers throughout the {area.postcode} area. We typically reach {area.name} in approximately {estimatedArrival} minutes from our base, making us one of the fastest mobile tyre services available in {city.county}.
            </Text>
          </Container>
        </Box>

        {/* ── PRICE ── */}
        <Box bg={c.bg} py={{ base: '60px', md: '80px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
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

        {/* ── NEARBY AREAS ── */}
        {nearbyAreas.length > 0 && (
          <Box bg={c.surface} py={{ base: '40px', md: '60px' }} px={{ base: 4, md: 8 }}>
            <Container maxW="1200px">
              <Text fontSize="16px" fontWeight="600" color={c.text} mb={4} style={{ fontFamily: 'var(--font-body)' }}>
                Nearby Areas We Also Cover
              </Text>
              <Flex gap={2} wrap="wrap">
                {nearbyAreas.map((nearby) => (
                  <ChakraLink
                    key={nearby.slug}
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
                    <Link href={`/${service.slug}/${city.slug}/${nearby.slug}`}>
                      <Text fontSize="13px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>
                        {nearby.name}
                      </Text>
                    </Link>
                  </ChakraLink>
                ))}
              </Flex>
            </Container>
          </Box>
        )}

        {/* ── OTHER SERVICES ── */}
        <Box bg={c.bg} py={{ base: '40px', md: '60px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
            <Text fontSize="16px" fontWeight="600" color={c.text} mb={4} style={{ fontFamily: 'var(--font-body)' }}>
              Other Services in {area.name}
            </Text>
            <Flex gap={2} wrap="wrap">
              {otherServices.map((s) => (
                <ChakraLink
                  key={s.slug}
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
                  <Link href={`/${s.slug}/${city.slug}/${area.slug}`}>
                    <Text fontSize="13px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>
                      {s.name}
                    </Text>
                  </Link>
                </ChakraLink>
              ))}
            </Flex>
          </Container>
        </Box>

        {/* ── BACK LINKS ── */}
        <Box bg={c.surface} py={{ base: '40px', md: '60px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
            <Flex gap={6} direction={{ base: 'column', md: 'row' }}>
              <ChakraLink
                asChild
                fontSize="14px" color={c.accent} _hover={{ opacity: 0.8 }}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                <Link href={`/${service.slug}/${city.slug}`}>
                  ← All areas in {city.name}
                </Link>
              </ChakraLink>
              <ChakraLink
                asChild
                fontSize="14px" color={c.muted} _hover={{ color: c.text }}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                <Link href={`/${service.slug}/${city.slug}`}>
                  View all {city.name} {service.name}
                </Link>
              </ChakraLink>
            </Flex>
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
              NEED A TYRE FITTER IN {area.name.toUpperCase()}?
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
