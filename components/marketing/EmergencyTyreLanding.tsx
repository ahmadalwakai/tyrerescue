'use client';

import { Box, Container, Text, Flex, SimpleGrid } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { EmergencyStickyCta } from './EmergencyStickyCta';
import { EmergencyServiceAreas, type ServiceArea } from './EmergencyServiceAreas';
import { EmergencyFaq } from './EmergencyFaq';
import type { FaqItem } from './emergency-faq-data';

export type EmergencyTyreLandingProps = {
  serviceAreas: readonly ServiceArea[];
  phoneDisplay: string;
  phoneHref: string;
  faqs: readonly FaqItem[];
};

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const TRUST_BULLETS = [
  'Mobile tyre fitting at your exact location',
  'Help for flat tyres and roadside tyre issues',
  'Coverage across Glasgow, Edinburgh and Central Scotland',
  '24/7 — every day of the year including bank holidays',
];

const RESPONSE_TIMES = [
  { time: '30–45 min', area: 'Glasgow City Centre', sub: 'G1–G4 postcodes' },
  { time: '45–60 min', area: 'Greater Glasgow', sub: 'Paisley, East Kilbride, Hamilton' },
  { time: '60–90 min', area: 'Central Scotland', sub: 'Stirling, Falkirk, Dundee' },
];

const HOW_IT_WORKS = [
  {
    num: '1',
    title: 'Contact Us',
    text: 'Call or start a request with your location and vehicle details. Our team confirms availability and assigns the nearest fitter with your tyre size in stock.',
  },
  {
    num: '2',
    title: 'Fitter Dispatched',
    text: 'Your mobile fitter travels to your exact location — car park, roadside, home, or workplace. No tow truck or recovery van required.',
  },
  {
    num: '3',
    title: 'Tyre Fitted On-Site',
    text: 'Fitting is carried out at your location. Payment is taken by card when the work is complete.',
  },
];

export function EmergencyTyreLanding({
  serviceAreas,
  phoneDisplay,
  phoneHref,
  faqs,
}: EmergencyTyreLandingProps) {
  return (
    <Box bg={c.bg} minH="100vh">

      {/* ── Hero ─────────────────────────────────────────── */}
      <Box
        as="section"
        aria-label="Emergency tyre fitting — contact"
        bg={c.surface}
        pt={{ base: '48px', md: '72px' }}
        pb={{ base: '52px', md: '72px' }}
        borderBottom="1px solid"
        borderColor={c.border}
      >
        <Container maxW="3xl" px={{ base: 4, md: 8 }}>

          {/* Badge */}
          <Box
            display="inline-flex"
            alignItems="center"
            bg={`${c.accent}18`}
            border="1px solid"
            borderColor={`${c.accent}44`}
            color={c.accent}
            px="12px"
            py="5px"
            borderRadius="full"
            fontSize="11px"
            fontWeight="700"
            letterSpacing="0.1em"
            mb="20px"
            style={{
              ...anim.fadeIn('0.4s'),
              fontFamily: 'var(--font-body)',
              textTransform: 'uppercase',
            }}
          >
            Emergency Tyre Fitting
          </Box>

          {/* H1 */}
          <Text
            as="h1"
            fontSize={{ base: '40px', sm: '52px', md: '64px' }}
            fontWeight="900"
            color={c.text}
            lineHeight={{ base: '1.05', md: '1' }}
            mb={{ base: '16px', md: '20px' }}
            style={{
              ...anim.fadeUp('0.5s', '0.05s'),
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.01em',
            }}
          >
            Emergency Mobile Tyre Fitting Near You
          </Text>

          {/* Subtext */}
          <Text
            fontSize={{ base: '16px', md: '18px' }}
            color={c.muted}
            lineHeight="1.7"
            mb={{ base: '32px', md: '36px' }}
            maxW="560px"
            style={{
              ...anim.fadeUp('0.5s', '0.1s'),
              fontFamily: 'var(--font-body)',
            }}
          >
            Flat tyre? Stranded roadside? Our mobile fitters come to your exact location
            with the right tyres — no tow truck needed. Fast, professional help for flat
            tyres, punctures, and emergency tyre replacement across Central Scotland.
          </Text>

          {/* CTA buttons */}
          <EmergencyStickyCta phoneDisplay={phoneDisplay} phoneHref={phoneHref} />

          {/* Trust bullets */}
          <Flex
            direction="column"
            gap="10px"
            mt="32px"
            style={anim.fadeUp('0.4s', '0.25s')}
          >
            {TRUST_BULLETS.map((bullet) => (
              <Flex key={bullet} align="center" gap="10px">
                <Box color={c.accent} flexShrink={0} lineHeight={0}>
                  <CheckIcon />
                </Box>
                <Text
                  fontSize="14px"
                  color={c.muted}
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  {bullet}
                </Text>
              </Flex>
            ))}
          </Flex>
        </Container>
      </Box>

      {/* ── Response times ────────────────────────────────── */}
      <Box
        as="section"
        aria-label="Estimated response times by area"
        py={{ base: '40px', md: '56px' }}
        borderBottom="1px solid"
        borderColor={c.border}
      >
        <Container maxW="3xl" px={{ base: 4, md: 8 }}>
          <Text
            as="h2"
            fontSize={{ base: '22px', md: '28px' }}
            fontWeight="700"
            color={c.text}
            mb={{ base: '24px', md: '32px' }}
            style={{ ...anim.fadeUp('0.4s'), fontFamily: 'var(--font-body)' }}
          >
            Response Times by Area
          </Text>

          <SimpleGrid columns={{ base: 1, md: 3 }} gap="14px">
            {RESPONSE_TIMES.map((item, i) => (
              <Box
                key={item.area}
                bg={c.card}
                border="1px solid"
                borderColor={c.border}
                borderRadius="10px"
                p={{ base: '20px', md: '24px' }}
                textAlign="center"
                style={anim.stagger('fadeUp', i, '0.35s', 0, 0.08)}
              >
                <Text
                  fontSize={{ base: '34px', md: '40px' }}
                  fontWeight="700"
                  color={c.accent}
                  mb="8px"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {item.time}
                </Text>
                <Text
                  fontSize="15px"
                  fontWeight="600"
                  color={c.text}
                  mb="5px"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  {item.area}
                </Text>
                <Text
                  fontSize="13px"
                  color={c.muted}
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  {item.sub}
                </Text>
              </Box>
            ))}
          </SimpleGrid>

          <Text
            mt="16px"
            fontSize="12px"
            color={c.muted}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Estimates based on typical conditions. Availability confirmed at time of contact.
          </Text>
        </Container>
      </Box>

      {/* ── How it works ─────────────────────────────────── */}
      <Box
        as="section"
        aria-label="How emergency tyre fitting works"
        py={{ base: '40px', md: '56px' }}
        borderBottom="1px solid"
        borderColor={c.border}
      >
        <Container maxW="3xl" px={{ base: 4, md: 8 }}>
          <Text
            as="h2"
            fontSize={{ base: '22px', md: '28px' }}
            fontWeight="700"
            color={c.text}
            mb={{ base: '24px', md: '32px' }}
            style={{ ...anim.fadeUp('0.4s'), fontFamily: 'var(--font-body)' }}
          >
            How Emergency Tyre Fitting Works
          </Text>

          <Flex direction="column" gap="28px">
            {HOW_IT_WORKS.map((step, i) => (
              <Flex
                key={step.num}
                gap="18px"
                align="flex-start"
                style={anim.stagger('fadeUp', i, '0.35s', 0, 0.09)}
              >
                <Text
                  fontSize="30px"
                  fontWeight="700"
                  color={c.accent}
                  lineHeight="1"
                  flexShrink={0}
                  w="28px"
                  textAlign="center"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {step.num}
                </Text>
                <Box>
                  <Text
                    fontSize="16px"
                    fontWeight="600"
                    color={c.text}
                    mb="6px"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {step.title}
                  </Text>
                  <Text
                    fontSize="15px"
                    color={c.muted}
                    lineHeight="1.7"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {step.text}
                  </Text>
                </Box>
              </Flex>
            ))}
          </Flex>
        </Container>
      </Box>

      {/* ── Service areas ────────────────────────────────── */}
      <Box
        as="section"
        aria-label="Service areas"
        py={{ base: '40px', md: '56px' }}
        borderBottom="1px solid"
        borderColor={c.border}
      >
        <Container maxW="3xl" px={{ base: 4, md: 8 }}>
          <Text
            as="h2"
            fontSize={{ base: '22px', md: '28px' }}
            fontWeight="700"
            color={c.text}
            mb="10px"
            style={{ ...anim.fadeUp('0.4s'), fontFamily: 'var(--font-body)' }}
          >
            Service Areas
          </Text>
          <Text
            fontSize="15px"
            color={c.muted}
            mb="24px"
            style={{ ...anim.fadeUp('0.4s', '0.05s'), fontFamily: 'var(--font-body)' }}
          >
            Emergency tyre fitting available across Central Scotland. Contact us to confirm
            coverage for your specific location.
          </Text>
          <EmergencyServiceAreas areas={serviceAreas} />
        </Container>
      </Box>

      {/* ── FAQ ──────────────────────────────────────────── */}
      <Box
        as="section"
        aria-label="Frequently asked questions"
        py={{ base: '40px', md: '56px' }}
        borderBottom="1px solid"
        borderColor={c.border}
      >
        <Container maxW="3xl" px={{ base: 4, md: 8 }}>
          <Text
            as="h2"
            fontSize={{ base: '22px', md: '28px' }}
            fontWeight="700"
            color={c.text}
            mb={{ base: '24px', md: '32px' }}
            style={{ ...anim.fadeUp('0.4s'), fontFamily: 'var(--font-body)' }}
          >
            Frequently Asked Questions
          </Text>
          <EmergencyFaq faqs={faqs} />
        </Container>
      </Box>

      {/* ── Bottom CTA ───────────────────────────────────── */}
      <Box
        as="section"
        aria-label="Contact for emergency tyre help"
        bg={c.surface}
        py={{ base: '52px', md: '72px' }}
      >
        <Container maxW="2xl" px={{ base: 4, md: 8 }}>
          <Text
            as="h2"
            fontSize={{ base: '28px', md: '40px' }}
            fontWeight="900"
            color={c.text}
            mb="12px"
            style={{ ...anim.fadeUp('0.4s'), fontFamily: 'var(--font-display)' }}
          >
            Need Emergency Tyre Help Now?
          </Text>
          <Text
            fontSize={{ base: '15px', md: '16px' }}
            color={c.muted}
            mb="32px"
            maxW="480px"
            style={{ ...anim.fadeUp('0.4s', '0.06s'), fontFamily: 'var(--font-body)' }}
          >
            Call us directly or start a request — our team will confirm availability and
            dispatch the nearest fitter.
          </Text>
          <EmergencyStickyCta phoneDisplay={phoneDisplay} phoneHref={phoneHref} />
        </Container>
      </Box>
    </Box>
  );
}
