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

            <Flex gap="14px" mt={10} direction="column" maxW={{ md: '480px' }}>
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
                _hover={{ transform: 'translateY(-2px)', boxShadow: '0 8px 32px rgba(249,115,22,0.5), 0 0 0 1px rgba(255,255,255,0.1) inset' }}
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
                _hover={{ bg: 'rgba(249,115,22,0.18)', borderColor: c.accent, transform: 'translateY(-1px)', boxShadow: '0 4px 20px rgba(249,115,22,0.2)' }}
                _active={{ transform: 'scale(0.98)' }}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <Link href="/emergency">EMERGENCY CALLOUT</Link>
              </ChakraLink>
              <ChakraLink
                asChild
                className="hero-cta-schedule"
                w="100%"
                h={{ base: '54px', md: '56px' }}
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                bg="rgba(24,24,27,0.6)"
                color={c.text}
                fontSize={{ base: '17px', md: '19px' }}
                fontWeight="700"
                letterSpacing="0.04em"
                borderRadius="12px"
                borderWidth="1px"
                borderColor={c.border}
                transition="all 0.3s cubic-bezier(0.4,0,0.2,1)"
                boxShadow="0 2px 12px rgba(0,0,0,0.15)"
                _hover={{ borderColor: 'rgba(249,115,22,0.5)', color: c.accent, transform: 'translateY(-1px)', boxShadow: '0 4px 20px rgba(249,115,22,0.12)' }}
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
                h={{ base: '54px', md: '56px' }}
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                gap="8px"
                bg="rgba(37,211,102,0.08)"
                color="#25D366"
                fontSize={{ base: '17px', md: '19px' }}
                fontWeight="700"
                letterSpacing="0.04em"
                borderRadius="12px"
                borderWidth="1px"
                borderColor="rgba(37,211,102,0.3)"
                transition="all 0.3s cubic-bezier(0.4,0,0.2,1)"
                boxShadow="0 2px 12px rgba(37,211,102,0.08)"
                _hover={{ bg: 'rgba(37,211,102,0.14)', borderColor: '#25D366', transform: 'translateY(-1px)', boxShadow: '0 4px 20px rgba(37,211,102,0.2)' }}
                _active={{ transform: 'scale(0.98)' }}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.198.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.174-.297-.019-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.174-.008-.372-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                WHATSAPP US
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
                mb={2}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                We provide {service.name.toLowerCase()} throughout {city.name} and all surrounding areas.
                Our mobile fitters cover every postcode in {city.county}.
              </Text>
              <Text fontSize="13px" color={c.muted} mb={8} style={{ fontFamily: 'var(--font-body)' }}>
                We cover {areas.length} areas in {city.name}.
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

        {/* ── ALL SERVICES ── */}
        <Box bg={c.surface} py={{ base: '40px', md: '60px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
            <Text fontSize="16px" fontWeight="600" color={c.text} mb={4} style={{ fontFamily: 'var(--font-body)' }}>
              All Services in {city.name}
            </Text>
            <Flex wrap="wrap" gap={2}>
              {services.map((s) => (
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
                  <Link href={`/${s.slug}/${city.slug}`}>
                    <Text fontSize="13px" color={s.slug === service.slug ? c.accent : c.muted} style={{ fontFamily: 'var(--font-body)' }}>
                      {s.name}
                    </Text>
                  </Link>
                </ChakraLink>
              ))}
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
    </Box>
  );
}
