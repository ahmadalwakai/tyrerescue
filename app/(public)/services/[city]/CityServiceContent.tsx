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
import type { City } from '@/lib/cities';

const c = colorTokens;

const services = [
  { title: 'Emergency Callout', desc: 'Driver to you within 45 minutes, 24/7.', price: 'From £49' },
  { title: 'Tyre Fitting', desc: 'Quality tyres fitted at your location.', price: 'From £20' },
  { title: 'Puncture Repair', desc: 'Professional assessment and repair on-site.', price: 'From £25' },
];

export function CityServiceContent({ city }: { city: City }) {
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
              MOBILE TYRE FITTING
            </Text>
            <Text
              as="h1"
              fontSize={{ base: '52px', md: '80px', lg: '100px' }}
              lineHeight="0.95"
              color={c.text}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              MOBILE TYRE FITTING IN {city.name.toUpperCase()}.
            </Text>
            <Text
              fontSize="17px"
              color={c.muted}
              maxW="520px"
              lineHeight="1.6"
              mt={6}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Flat tyre in {city.name}? Our certified mobile fitters come to your exact location, 24 hours a day, 7 days a week. No garage visit needed.
            </Text>

            <Flex gap={4} mt={10} direction={{ base: 'column', md: 'row' }}>
              <ChakraLink
                asChild
                px={10}
                h="56px"
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                bg={c.accent}
                color={c.bg}
                fontSize="20px"
                letterSpacing="0.05em"
                borderRadius="4px"
                w={{ base: '100%', md: 'auto' }}
                _hover={{ opacity: 0.9 }}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <Link href="/emergency">EMERGENCY CALLOUT</Link>
              </ChakraLink>
              <ChakraLink
                asChild
                px={10}
                h="56px"
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                bg="transparent"
                color={c.text}
                fontSize="20px"
                letterSpacing="0.05em"
                borderRadius="4px"
                borderWidth="1px"
                borderColor={c.border}
                w={{ base: '100%', md: 'auto' }}
                _hover={{ borderColor: c.accent, color: c.accent }}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <Link href="/book">SCHEDULE A FITTING</Link>
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

        {/* ── COVERAGE ── */}
        <Box bg={c.surface} py={{ base: '60px', md: '80px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
            <Text
              fontSize={{ base: '36px', md: '48px' }}
              color={c.text}
              mb={6}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              WE COVER ALL OF {city.name.toUpperCase()}
            </Text>
            <Text
              fontSize="15px"
              color={c.muted}
              lineHeight="1.7"
              maxW="640px"
              mb={8}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Our mobile fitters cover {city.name} and surrounding areas including {city.landmarks.join(', ')}. Whether you&apos;re at home, at work, or broken down at the roadside, we come to you.
            </Text>
            <Flex gap={3} wrap="wrap">
              {city.nearbyAreas.map((area) => (
                <Box
                  key={area}
                  bg={c.card}
                  borderWidth="1px"
                  borderColor={c.border}
                  borderRadius="4px"
                  px={4}
                  py={2}
                >
                  <Text fontSize="13px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>{area}</Text>
                </Box>
              ))}
            </Flex>
          </Container>
        </Box>

        {/* ── SERVICES ── */}
        <Box bg={c.bg} py={{ base: '60px', md: '80px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={6}>
              {services.map((s) => (
                <Box
                  key={s.title}
                  bg={c.surface}
                  borderWidth="1px"
                  borderColor={c.border}
                  borderRadius="8px"
                  p={6}
                >
                  <Text fontSize={{ base: '20px', md: '24px' }} color={c.text} mb={2} style={{ fontFamily: 'var(--font-display)' }}>{s.title}</Text>
                  <Text fontSize="14px" color={c.muted} lineHeight="1.6" mb={4} style={{ fontFamily: 'var(--font-body)' }}>{s.desc}</Text>
                  <Text fontSize="20px" color={c.accent} style={{ fontFamily: 'var(--font-display)' }}>{s.price}</Text>
                </Box>
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
              FLAT TYRE IN {city.name.toUpperCase()}?
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
                px={8}
                py={4}
                bg={c.bg}
                color={c.accent}
                fontSize="18px"
                letterSpacing="0.05em"
                borderRadius="4px"
                textAlign="center"
                w={{ base: '100%', sm: 'auto' }}
                minH="48px"
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                _hover={{ opacity: 0.9 }}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                CALL NOW
              </ChakraLink>
              <ChakraLink
                asChild
                px={8}
                py={4}
                bg="transparent"
                color={c.bg}
                fontSize="18px"
                letterSpacing="0.05em"
                borderRadius="4px"
                borderWidth="2px"
                borderColor={c.bg}
                textAlign="center"
                w={{ base: '100%', sm: 'auto' }}
                minH="48px"
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
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
