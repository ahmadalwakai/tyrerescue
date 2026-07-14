'use client';

import { Box, Container, Flex, Link as ChakraLink, SimpleGrid, Text } from '@chakra-ui/react';
import { CallNowButton } from '@/components/conversion/CallNowButton';
import { trackEmergencyBookingClick, trackEmergencyTrackingClick } from '@/lib/analytics/conversions';
import { colorTokens } from '@/lib/design-tokens';
import {
  EMERGENCY_PHONE_DISPLAY,
  emergencyCampaign,
  type ServiceArea,
} from '@/lib/ads/emergencyCampaign';

type EmergencyHeroProps = {
  readonly area?: ServiceArea;
  readonly serviceLabel?: string;
  readonly headline?: string;
  readonly copy?: string;
};

function ArrowIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function EmergencyHero({
  area,
  serviceLabel = 'Emergency tyre fitting',
  headline,
  copy,
}: EmergencyHeroProps) {
  const title =
    headline ??
    (area
      ? `${serviceLabel} in ${area.areaName}, ${area.cityName}`
      : 'Emergency tyre fitting across mainland Scotland');
  const body =
    copy ??
    (area
      ? `Flat tyre near ${area.landmark}? Tyre Rescue sends a 24/7 mobile tyre fitter to ${area.areaName} with a ${area.responseMinutes}-minute emergency response, subject to live dispatch and tyre availability.`
      : 'Flat tyre, puncture, or roadside tyre failure? Tyre Rescue sends a mobile tyre fitter to your location 24/7, with a 45-minute emergency response across mainland Scotland.');

  const stats = [
    {
      value: `${emergencyCampaign.responsePromiseMinutes} min`,
      label: 'Emergency response',
    },
    { value: '24/7', label: 'Day and night' },
    { value: 'Mainland', label: 'Scotland only' },
  ] as const;

  return (
    <Box
      as="section"
      bg={colorTokens.bg}
      color={colorTokens.text}
      borderBottomWidth="1px"
      borderColor={colorTokens.border}
      pt={{ base: '38px', md: '72px' }}
      pb={{ base: '44px', md: '76px' }}
      px={{ base: 4, md: 8 }}
    >
      <Container maxW="1180px" px={0}>
        <SimpleGrid columns={{ base: 1, lg: 2 }} gap={{ base: '34px', lg: '54px' }} alignItems="center">
          <Box>
            <Flex
              display="inline-flex"
              align="center"
              gap="8px"
              px="12px"
              py="7px"
              bg="rgba(20,184,166,0.12)"
              color="#7dd3fc"
              borderWidth="1px"
              borderColor="rgba(125,211,252,0.3)"
              borderRadius="8px"
              fontSize="12px"
              fontWeight="800"
              mb="18px"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              <LocationIcon />
              Scotland mainland only - no islands
            </Flex>

            <Text
              as="h1"
              fontSize={{ base: '42px', sm: '50px', md: '70px', lg: '82px' }}
              lineHeight="0.96"
              fontWeight="900"
              color={colorTokens.text}
              maxW="780px"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {title}
            </Text>

            <Text
              mt="20px"
              fontSize={{ base: '16px', md: '18px' }}
              lineHeight="1.7"
              color={colorTokens.muted}
              maxW="660px"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {body}
            </Text>

            <Flex direction={{ base: 'column', sm: 'row' }} gap="12px" mt="28px" maxW="720px">
              <CallNowButton source={area ? 'emergency_local' : 'emergency_hero'} />
              <ChakraLink
                href="/book"
                onClick={() => trackEmergencyBookingClick(area ? 'emergency_local' : 'emergency_hero')}
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                gap="8px"
                minH="54px"
                px={{ base: '20px', md: '26px' }}
                bg={colorTokens.card}
                color={colorTokens.text}
                borderWidth="1px"
                borderColor={colorTokens.border}
                borderRadius="8px"
                fontSize={{ base: '17px', md: '18px' }}
                fontWeight="800"
                textDecoration="none"
                _hover={{ textDecoration: 'none', borderColor: colorTokens.accent }}
                _active={{ transform: 'scale(0.98)' }}
                aria-label="Book emergency tyre fitting online"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Book online
                <ArrowIcon />
              </ChakraLink>
              <ChakraLink
                href="/tracking"
                onClick={() => trackEmergencyTrackingClick(area ? 'emergency_local' : 'emergency_hero')}
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                minH="54px"
                px={{ base: '20px', md: '24px' }}
                bg="transparent"
                color={colorTokens.text}
                borderWidth="1px"
                borderColor={colorTokens.border}
                borderRadius="8px"
                fontSize={{ base: '16px', md: '17px' }}
                fontWeight="700"
                textDecoration="none"
                _hover={{ textDecoration: 'none', color: colorTokens.accent, borderColor: colorTokens.accent }}
                _active={{ transform: 'scale(0.98)' }}
                aria-label="Track your tyre fitter"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Track your fitter
              </ChakraLink>
            </Flex>

            <Text mt="14px" fontSize="13px" color={colorTokens.muted} style={{ fontFamily: 'var(--font-body)' }}>
              Call {EMERGENCY_PHONE_DISPLAY}. Availability and tyre size confirmed before dispatch.
            </Text>
          </Box>

          <Box
            borderWidth="1px"
            borderColor={colorTokens.border}
            borderRadius="8px"
            bg={colorTokens.surface}
            p={{ base: '18px', md: '24px' }}
          >
            <SimpleGrid columns={1} gap="12px">
              {stats.map((stat) => (
                <Flex
                  key={stat.label}
                  align="center"
                  justify="space-between"
                  minH="82px"
                  borderWidth="1px"
                  borderColor={colorTokens.border}
                  borderRadius="8px"
                  bg={colorTokens.card}
                  px={{ base: '16px', md: '20px' }}
                >
                  <Text fontSize="14px" color={colorTokens.muted} style={{ fontFamily: 'var(--font-body)' }}>
                    {stat.label}
                  </Text>
                  <Text
                    fontSize={{ base: '34px', md: '42px' }}
                    color={stat.value === '24/7' ? '#5eead4' : colorTokens.accent}
                    lineHeight="1"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {stat.value}
                  </Text>
                </Flex>
              ))}
            </SimpleGrid>
            <Box mt="16px" borderWidth="1px" borderColor="rgba(125,211,252,0.28)" borderRadius="8px" p="16px" bg="rgba(20,184,166,0.08)">
              <Text fontSize="14px" color={colorTokens.text} fontWeight="700" mb="6px" style={{ fontFamily: 'var(--font-body)' }}>
                Built for emergency intent
              </Text>
              <Text fontSize="13px" color={colorTokens.muted} lineHeight="1.7" style={{ fontFamily: 'var(--font-body)' }}>
                Flat tyre help, mobile tyre fitter near you, 24/7 roadside tyre help, puncture repair, and motorway tyre assistance.
              </Text>
            </Box>
          </Box>
        </SimpleGrid>
      </Container>
    </Box>
  );
}
