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
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { AIOptimizedSection } from '@/components/seo/AIOptimizedSection';
import { colorTokens } from '@/lib/design-tokens';
import type { ServiceSEO, Area } from '@/lib/areas';
import { services } from '@/lib/areas';
import type { City } from '@/lib/cities';
import type { NeighborhoodEnrichment } from '@/lib/data/neighborhoodEnrichment';

const c = colorTokens;

export function ServiceAreaContent({ service, city, area, allCityAreas, enrichment }: { service: ServiceSEO; city: City; area: Area; allCityAreas: Area[]; enrichment?: NeighborhoodEnrichment }) {
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
            <Breadcrumbs items={[
              { label: 'Home', href: '/' },
              { label: `${service.name} ${city.name}`, href: `/${service.slug}/${city.slug}` },
              { label: area.name },
            ]} />
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

            <Box className="hero-cta-panel" mt={10} maxW={{ md: '520px' }}>
            <Flex gap={{ base: '14px', md: '16px' }} direction="column">
              <ChakraLink
                href="tel:01412660690"
                className="hero-cta-call"
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                gap="10px"
                w="100%"
                h={{ base: '58px', md: '60px' }}
                bg="linear-gradient(135deg, #f97316 0%, #ea580c 100%)"
                color="white"
                fontSize={{ base: '18px', md: '20px' }}
                fontWeight="800"
                letterSpacing="0.04em"
                borderRadius="14px"
                transition="all 0.3s cubic-bezier(0.4,0,0.2,1)"
                boxShadow="0 4px 20px rgba(249,115,22,0.35), 0 0 0 1px rgba(255,255,255,0.06) inset"
                _hover={{ transform: 'translateY(-3px)', boxShadow: '0 12px 40px rgba(249,115,22,0.6), 0 0 0 1px rgba(255,255,255,0.12) inset' }}
                _active={{ transform: 'scale(0.97)' }}
                aria-label="Call now"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                CALL NOW
              </ChakraLink>
              <ChakraLink
                asChild
                className="hero-cta-emergency"
                w="100%"
                h={{ base: '54px', md: '56px' }}
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                bg="rgba(249,115,22,0.12)"
                color={c.accent}
                fontSize={{ base: '17px', md: '19px' }}
                fontWeight="700"
                letterSpacing="0.04em"
                borderRadius="12px"
                borderWidth="1.5px"
                borderColor="rgba(249,115,22,0.4)"
                transition="all 0.3s cubic-bezier(0.4,0,0.2,1)"
                boxShadow="0 2px 12px rgba(249,115,22,0.1)"
                _hover={{ bg: 'rgba(249,115,22,0.22)', borderColor: c.accent, transform: 'translateY(-2px)', boxShadow: '0 6px 24px rgba(249,115,22,0.25)' }}
                _active={{ transform: 'scale(0.98)' }}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <Link href="/emergency">EMERGENCY CALLOUT</Link>
              </ChakraLink>
              <Flex direction={{ base: 'column', md: 'row' }} gap={{ base: '14px', md: '12px' }}>
                <ChakraLink
                  asChild
                  className="hero-cta-schedule"
                  w="100%"
                  flex={{ md: '1' }}
                  h={{ base: '54px', md: '52px' }}
                  display="inline-flex"
                  alignItems="center"
                  justifyContent="center"
                  bg="rgba(24,24,27,0.6)"
                  color={c.text}
                  fontSize="17px"
                  fontWeight="700"
                  letterSpacing="0.04em"
                  borderRadius="12px"
                  borderWidth="1px"
                  borderColor={c.border}
                  transition="all 0.3s cubic-bezier(0.4,0,0.2,1)"
                  boxShadow="0 2px 12px rgba(0,0,0,0.15)"
                  _hover={{ borderColor: 'rgba(249,115,22,0.5)', color: c.accent, transform: 'translateY(-2px)', boxShadow: '0 6px 24px rgba(249,115,22,0.18)' }}
                  _active={{ transform: 'scale(0.98)' }}
                  style={{ fontFamily: 'var(--font-display)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
                >
                  <Link href="/book">SCHEDULE A FITTING</Link>
                </ChakraLink>
                <ChakraLink
                  href="https://wa.me/447423262955"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hero-cta-whatsapp"
                  w="100%"
                  flex={{ md: '1' }}
                  h={{ base: '54px', md: '52px' }}
                  display="inline-flex"
                  alignItems="center"
                  justifyContent="center"
                  gap="8px"
                  bg="rgba(37,211,102,0.08)"
                  color="#25D366"
                  fontSize="17px"
                  fontWeight="700"
                  letterSpacing="0.04em"
                  borderRadius="12px"
                  borderWidth="1px"
                  borderColor="rgba(37,211,102,0.3)"
                  transition="all 0.3s cubic-bezier(0.4,0,0.2,1)"
                  boxShadow="0 2px 12px rgba(37,211,102,0.08)"
                  _hover={{ bg: 'rgba(37,211,102,0.14)', borderColor: '#25D366', transform: 'translateY(-2px)', boxShadow: '0 6px 24px rgba(37,211,102,0.25)' }}
                  _active={{ transform: 'scale(0.98)' }}
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.198.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.174-.297-.019-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.174-.008-.372-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                  WHATSAPP US
                </ChakraLink>
              </Flex>
            </Flex>
            </Box>
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

        {/* ── AI-OPTIMIZED Q&A ── */}
        <Box bg={c.bg} py={{ base: '60px', md: '80px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
            <AIOptimizedSection
              question={`How fast can a mobile tyre fitter get to ${area.name}?`}
              directAnswer={`Our mobile tyre fitters typically reach ${area.name} (${area.postcode}) in approximately ${estimatedArrival} minutes. We are ${area.distanceFromCentre.toFixed(1)} miles from ${city.name} city centre, and our 24/7 dispatch means help is always on the way — day or night.`}
              entityType="location"
              detailedAnswer={
                <Box>
                  <Text fontSize="15px" color={c.muted} lineHeight="1.8" mb={4} style={{ fontFamily: 'var(--font-body)' }}>
                    Response times to {area.name} depend on traffic conditions and fitter availability, but our average is {estimatedArrival} minutes.
                    We carry a full range of tyres in our vans, so in most cases we complete the job in a single visit near {area.nearestLandmark}.
                  </Text>
                  <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
                    <Box bg={c.card} borderRadius="8px" p={5} borderWidth="1px" borderColor={c.border}>
                      <Text fontSize="28px" color={c.accent} fontWeight="700" style={{ fontFamily: 'var(--font-display)' }}>~{estimatedArrival} MIN</Text>
                      <Text fontSize="13px" color={c.muted} mt={1} style={{ fontFamily: 'var(--font-body)' }}>Average response to {area.name}</Text>
                    </Box>
                    <Box bg={c.card} borderRadius="8px" p={5} borderWidth="1px" borderColor={c.border}>
                      <Text fontSize="28px" color={c.accent} fontWeight="700" style={{ fontFamily: 'var(--font-display)' }}>24/7</Text>
                      <Text fontSize="13px" color={c.muted} mt={1} style={{ fontFamily: 'var(--font-body)' }}>Available day and night</Text>
                    </Box>
                    <Box bg={c.card} borderRadius="8px" p={5} borderWidth="1px" borderColor={c.border}>
                      <Text fontSize="28px" color={c.accent} fontWeight="700" style={{ fontFamily: 'var(--font-display)' }}>{area.distanceFromCentre.toFixed(1)} MI</Text>
                      <Text fontSize="13px" color={c.muted} mt={1} style={{ fontFamily: 'var(--font-body)' }}>From {city.name} centre</Text>
                    </Box>
                  </SimpleGrid>
                </Box>
              }
              relatedQuestions={[
                `What tyres do you carry for ${area.name} customers?`,
                `Do you fit tyres at roadside in ${area.postcode}?`,
                `How much does ${service.name.toLowerCase()} cost in ${area.name}?`,
                `Can you fit run-flat tyres in ${area.name}?`,
              ]}
            />
          </Container>
        </Box>

        {/* ── ENRICHMENT: LANDMARKS & CHARACTER ── */}
        {enrichment && (
          <Box bg={c.surface} py={{ base: '60px', md: '80px' }} px={{ base: 4, md: 8 }}>
            <Container maxW="1200px">
              <Text
                as="h2"
                fontSize={{ base: '36px', md: '48px' }}
                color={c.text}
                mb={6}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                WHY CUSTOMERS IN {area.name.toUpperCase()} CHOOSE US
              </Text>
              <Text
                fontSize="15px"
                color={c.muted}
                lineHeight="1.8"
                maxW="640px"
                mb={8}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {enrichment.description}
              </Text>

              {/* Landmarks grid */}
              <Text fontSize="14px" fontWeight="600" color={c.text} mb={4} style={{ fontFamily: 'var(--font-body)' }}>
                Key Landmarks We Serve Near
              </Text>
              <Flex gap={2} wrap="wrap" mb={8}>
                {enrichment.landmarks.map((landmark) => (
                  <Box
                    key={landmark}
                    bg={c.card}
                    borderWidth="1px"
                    borderColor={c.border}
                    borderRadius="4px"
                    px={4}
                    py={2}
                  >
                    <Text fontSize="13px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>
                      📍 {landmark}
                    </Text>
                  </Box>
                ))}
              </Flex>

              {/* Key Roads */}
              <Text fontSize="14px" fontWeight="600" color={c.text} mb={4} style={{ fontFamily: 'var(--font-body)' }}>
                Roads & Areas We Frequently Cover
              </Text>
              <Flex gap={2} wrap="wrap" mb={8}>
                {enrichment.keyRoads.map((road) => (
                  <Box
                    key={road}
                    bg={c.card}
                    borderWidth="1px"
                    borderColor={c.border}
                    borderRadius="4px"
                    px={4}
                    py={2}
                  >
                    <Text fontSize="13px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>
                      🛣️ {road}
                    </Text>
                  </Box>
                ))}
              </Flex>

              {/* Parking notes */}
              <Box bg={c.card} borderRadius="8px" p={6} borderWidth="1px" borderColor={c.border}>
                <Text fontSize="14px" fontWeight="600" color={c.accent} mb={2} style={{ fontFamily: 'var(--font-body)' }}>
                  🅿️ Parking & Access Notes for {area.name}
                </Text>
                <Text fontSize="14px" color={c.muted} lineHeight="1.7" style={{ fontFamily: 'var(--font-body)' }}>
                  {enrichment.parkingNotes}
                </Text>
              </Box>
            </Container>
          </Box>
        )}

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
    </Box>
  );
}
