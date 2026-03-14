'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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

const colors = {
  bg: colorTokens.bg,
  surface: colorTokens.surface,
  card: colorTokens.card,
  accent: colorTokens.accent,
  textPrimary: colorTokens.text,
  textSecondary: colorTokens.muted,
  border: colorTokens.border,
};

const PHONE_NUMBER = '0141 266 0690';

const services = [
  {
    num: '01',
    title: 'Emergency Callout',
    description:
      'Driver to you within 45 minutes. Available 24 hours a day, 7 days a week. Fast response when you need it most.',
    price: 'From £49',
  },
  {
    num: '02',
    title: 'Tyre Fitting',
    description:
      'New and used tyres fitted at your location. Professional service at your home, workplace, or roadside.',
    price: 'From £20',
  },
  {
    num: '03',
    title: 'Puncture Repair',
    description:
      'Professional assessment and repair where possible. We check damage and fix safely on-site.',
    price: 'From £25',
  },
];

const steps = [
  { number: '01', title: 'Book Online', description: 'Select your service and enter your location in under 3 minutes.' },
  { number: '02', title: 'We Dispatch', description: 'A certified fitter is assigned and heads to your exact location.' },
  { number: '03', title: 'Driver Arrives', description: 'Track your fitter in real-time as they travel to you.' },
  { number: '04', title: 'Job Done', description: 'Professional fitting complete. Back on the road safely.' },
];

const testimonials = [
  { author: 'James M.', content: 'Called at 10pm with a flat on the M8. They arrived in 35 minutes and had me back on the road. Brilliant service.', rating: '4.9 / 5' },
  { author: 'Sarah K.', content: 'Booked a fitting for my driveway. The fitter was professional, quick, and competitively priced. Will use again.', rating: '5.0 / 5' },
  { author: 'David R.', content: 'Best mobile tyre service in Glasgow. Fair prices and they actually turn up when they say they will.', rating: '4.8 / 5' },
  { author: 'Emma W.', content: 'Flat tyre on the way to Edinburgh airport. These guys saved me from missing my flight. Cannot recommend enough.', rating: '5.0 / 5' },
];

const faqs = [
  { question: 'How quickly can you get to me in an emergency?', answer: 'For emergency callouts in Glasgow and Edinburgh city centres, we typically arrive within 45 minutes. For surrounding areas, arrival times vary based on distance but we always provide an accurate ETA when you book.' },
  { question: 'What areas do you cover?', answer: 'We cover Glasgow, Edinburgh, and all surrounding areas within 50 miles of our base. This includes Paisley, East Kilbride, Hamilton, Livingston, Falkirk, and more.' },
  { question: 'Do you fit tyres I have already purchased?', answer: 'We primarily fit tyres purchased through our service to ensure quality and warranty coverage. If you have tyres you need fitted, please call us to discuss.' },
  { question: 'What payment methods do you accept?', answer: 'We accept all major credit and debit cards, Apple Pay, and Google Pay through our secure online checkout. Payment is taken at the time of booking.' },
  { question: 'Can you repair my puncture or do I need a new tyre?', answer: 'Our fitters assess every puncture on arrival. Repairs are only possible when the damage is in the central tread area and the tyre structure is intact. Sidewall damage or multiple punctures require replacement.' },
];

const marqueeItems = [
  'EMERGENCY CALLOUT',
  'GLASGOW & EDINBURGH',
  '24 HOURS A DAY',
  'MOBILE TYRE FITTING',
  'PUNCTURE REPAIR',
  'NEW AND USED TYRES',
];

const cssKeyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(40px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(60px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes marquee {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }
  @keyframes pulseGlow {
    0% { box-shadow: 0 0 0 0 rgba(249,115,22,0.4); }
    70% { box-shadow: 0 0 0 12px rgba(249,115,22,0); }
    100% { box-shadow: 0 0 0 0 rgba(249,115,22,0); }
  }
  @keyframes lineGrow {
    from { width: 0; }
    to { width: 60px; }
  }
  @keyframes timelineGrow {
    from { width: 0; }
    to { width: 100%; }
  }
`;

// ─── Counter Hook ────────────────────────────────────────
function useCountUp(end: number, duration: number = 1500, decimals: number = 0) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const startTime = performance.now();
          const step = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(parseFloat((eased * end).toFixed(decimals)));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration, decimals]);

  return { value, ref };
}

// ─── Animated Section ────────────────────────────────────
function AnimatedSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <Box
      ref={ref}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(40px)',
        transition: `all 0.6s ease-out ${delay}s`,
      }}
    >
      {children}
    </Box>
  );
}

// ─── FAQ Item ────────────────────────────────────────────
function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <Box borderBottomWidth="1px" borderColor={colors.border}>
      <Flex
        justify="space-between"
        align="center"
        cursor="pointer"
        py="24px"
        onClick={() => setIsOpen(!isOpen)}
        _hover={{ opacity: 0.8 }}
      >
        <Text
          fontWeight="500"
          color={colors.textPrimary}
          fontSize="16px"
          pr={4}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {question}
        </Text>
        <Text
          as="span"
          color={colors.accent}
          fontSize="24px"
          flexShrink={0}
          style={{ fontFamily: 'var(--font-body)', transition: 'transform 0.2s' }}
        >
          {isOpen ? '−' : '+'}
        </Text>
      </Flex>
      <Box
        ref={contentRef}
        overflow="hidden"
        style={{
          maxHeight: isOpen ? '500px' : '0',
          opacity: isOpen ? 1 : 0,
          transition: 'max-height 0.4s ease, opacity 0.3s ease',
        }}
      >
        <Text
          color={colors.textSecondary}
          fontSize="14px"
          lineHeight="1.7"
          pb="24px"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {answer}
        </Text>
      </Box>
    </Box>
  );
}

// ─── Main Component ──────────────────────────────────────
export function HomePage() {
  const [heroOffset, setHeroOffset] = useState(0);
  const stat1 = useCountUp(97, 1500);
  const stat2 = useCountUp(4.8, 1500, 1);
  const stat3 = useCountUp(45, 1500);
  const [timelineVisible, setTimelineVisible] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    setHeroOffset(window.scrollY * 0.3);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimelineVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    if (timelineRef.current) observer.observe(timelineRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <Box minH="100vh" display="flex" flexDirection="column" bg={colors.bg}>
      <style>{cssKeyframes}</style>
      <Nav />

      <Box as="main" flex={1}>
        {/* ═══════════════════════════════════════════════════
            SECTION 1: HERO
        ═══════════════════════════════════════════════════ */}
        <Box
          position="relative"
          minH="100vh"
          overflow="hidden"
          display="flex"
          alignItems="center"
        >
          {/* Background layers */}
          <Box position="absolute" inset={0} bg={colors.bg} />
          <Box
            position="absolute"
            inset={0}
            style={{
              background: 'radial-gradient(ellipse at top right, rgba(249,115,22,0.06) 0%, transparent 60%)',
              transform: `translateY(${heroOffset}px)`,
            }}
          />
          <Box
            position="absolute"
            inset={0}
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 60px)',
              backgroundSize: '60px 60px',
            }}
          />
          {/* Noise overlay */}
          <Box
            position="absolute"
            inset={0}
            opacity={0.03}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            }}
          />
          {/* Giant watermark */}
          <Text
            position="absolute"
            bottom="-80px"
            right="-40px"
            fontSize={{ base: '200px', lg: '400px' }}
            color="rgba(255,255,255,0.025)"
            lineHeight="1"
            zIndex={0}
            userSelect="none"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            24/7
          </Text>

          {/* Content */}
          <Container maxW="7xl" position="relative" zIndex={1} py={{ base: 16, lg: 0 }}>
            <Flex
              direction={{ base: 'column', lg: 'row' }}
              gap={{ base: 12, lg: 16 }}
              align={{ base: 'stretch', lg: 'center' }}
            >
              {/* Left column — 55% */}
              <Box flex={{ lg: '0 0 55%' }}>
                <Text
                  fontSize="11px"
                  fontWeight="500"
                  letterSpacing="0.2em"
                  color={colors.accent}
                  mb={6}
                  style={{
                    fontFamily: 'var(--font-body)',
                    animation: 'fadeUp 0.5s ease-out both',
                  }}
                >
                  EMERGENCY MOBILE TYRE FITTING
                </Text>

                <Box
                  style={{
                    animation: 'fadeUp 0.6s ease-out 0.1s both',
                  }}
                >
                  <Text
                    as="h1"
                    color={colors.textPrimary}
                    lineHeight="0.92"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'clamp(52px, 10vw, 140px)',
                    }}
                  >
                    GLASGOW &
                  </Text>
                  <Text
                    as="span"
                    display="block"
                    color={colors.textPrimary}
                    lineHeight="0.92"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'clamp(52px, 10vw, 140px)',
                    }}
                  >
                    EDINBURGH.
                  </Text>
                </Box>

                {/* Accent line */}
                <Box
                  h="2px"
                  bg={colors.accent}
                  my="24px"
                  style={{
                    animation: 'lineGrow 0.6s ease-out 0.3s both',
                  }}
                />

                <Text
                  fontSize="17px"
                  color={colors.textSecondary}
                  maxW="440px"
                  lineHeight="1.6"
                  style={{
                    fontFamily: 'var(--font-body)',
                    animation: 'fadeUp 0.6s ease-out 0.4s both',
                  }}
                >
                  Flat tyre? Our certified mobile fitters come to your exact location, 24 hours a day.
                </Text>

                {/* Buttons */}
                <Flex
                  gap={4}
                  mt="40px"
                  direction={{ base: 'column', sm: 'row' }}
                  style={{ animation: 'fadeUp 0.6s ease-out 0.5s both' }}
                >
                  <ChakraLink
                    asChild
                    px="40px"
                    h="56px"
                    display="inline-flex"
                    alignItems="center"
                    justifyContent="center"
                    bg={colors.accent}
                    color={colors.bg}
                    fontSize="20px"
                    letterSpacing="0.05em"
                    borderRadius="4px"
                    transition="all 0.2s"
                    _hover={{ opacity: 0.9 }}
                    _active={{ transform: 'scale(0.98)' }}
                    style={{
                      fontFamily: 'var(--font-display)',
                      animation: 'pulseGlow 2s infinite',
                    }}
                  >
                    <Link href="/emergency">EMERGENCY CALLOUT</Link>
                  </ChakraLink>
                  <ChakraLink
                    asChild
                    px="40px"
                    h="56px"
                    display="inline-flex"
                    alignItems="center"
                    justifyContent="center"
                    bg="transparent"
                    color={colors.textPrimary}
                    fontSize="20px"
                    letterSpacing="0.05em"
                    borderRadius="4px"
                    borderWidth="1px"
                    borderColor={colors.border}
                    transition="all 0.2s"
                    _hover={{ borderColor: colors.accent, color: colors.accent }}
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    <Link href="/book">SCHEDULE A FITTING</Link>
                  </ChakraLink>
                </Flex>

                {/* Stats */}
                <Flex mt="48px" gap={{ base: 4, md: 0 }} wrap="wrap" style={{ animation: 'fadeUp 0.6s ease-out 0.6s both' }}>
                  <Box pr={{ base: '16px', md: '32px' }} ref={stat1.ref}>
                    <Text
                      fontSize={{ base: '32px', md: '48px' }}
                      color={colors.textPrimary}
                      lineHeight="1"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {stat1.value}
                    </Text>
                    <Text fontSize="12px" color={colors.textSecondary} style={{ fontFamily: 'var(--font-body)' }}>
                      Google Reviews
                    </Text>
                  </Box>
                  <Box
                    borderLeftWidth="1px"
                    borderRightWidth="1px"
                    borderColor={colors.border}
                    px={{ base: '16px', md: '32px' }}
                    ref={stat2.ref}
                  >
                    <Text
                      fontSize={{ base: '32px', md: '48px' }}
                      color={colors.accent}
                      lineHeight="1"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {stat2.value}
                    </Text>
                    <Text fontSize="12px" color={colors.textSecondary} style={{ fontFamily: 'var(--font-body)' }}>
                      Star Rating
                    </Text>
                  </Box>
                  <Box pl={{ base: '16px', md: '32px' }} ref={stat3.ref}>
                    <Text
                      fontSize={{ base: '32px', md: '48px' }}
                      color={colors.textPrimary}
                      lineHeight="1"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {stat3.value}min
                    </Text>
                    <Text fontSize="12px" color={colors.textSecondary} style={{ fontFamily: 'var(--font-body)' }}>
                      Avg Response
                    </Text>
                  </Box>
                </Flex>
              </Box>

              {/* Right column — 45% */}
              <Box flex={{ lg: '0 0 45%' }} position="relative">
                {/* Accent line */}
                <Box
                  position="absolute"
                  left="-1px"
                  top="20%"
                  w="3px"
                  h="60%"
                  bg={colors.accent}
                  zIndex={2}
                />
                <Box
                  bg={colors.card}
                  borderWidth="1px"
                  borderColor={colors.border}
                  p="40px"
                  position="relative"
                  style={{
                    clipPath: 'polygon(0 0, 100% 0, 100% 92%, 92% 100%, 0 100%)',
                    fontFamily: 'var(--font-body)',
                    animation: 'slideInRight 0.8s ease-out 0.3s both',
                  }}
                >
                  <Text
                    fontSize="10px"
                    color={colors.accent}
                    letterSpacing="0.2em"
                    mb={3}
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    OUR WORKSHOP
                  </Text>
                  <Text
                    fontSize="36px"
                    color={colors.textPrimary}
                    lineHeight="1.1"
                    mb={1}
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    MOBILE TYRE FITTING
                  </Text>
                  <Text fontSize="13px" color={colors.textSecondary} mb={0}>
                    Duke Street Tyres
                  </Text>

                  <Box h="1px" bg={colors.border} my="24px" />

                  <Text fontSize="14px" color={colors.textPrimary} lineHeight="1.5">
                    3, 10 Gateside St
                  </Text>
                  <Text fontSize="14px" color={colors.textPrimary} mb={4}>
                    Glasgow G31 1PD
                  </Text>

                  <ChakraLink
                    href={`tel:${PHONE_NUMBER.replace(/\s/g, '')}`}
                    display="block"
                    color={colors.accent}
                    letterSpacing="0.02em"
                    _hover={{ color: colors.textPrimary }}
                    transition="color 0.2s"
                    mb={2}
                    fontSize={{ base: '32px', md: '52px' }}
                    style={{
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    {PHONE_NUMBER}
                  </ChakraLink>

                  <Text fontSize="12px" color={colors.textSecondary}>
                    Open 8am to Midnight, Every Day
                  </Text>

                  <Box h="1px" bg={colors.border} my="24px" />

                  <Flex justify="space-between" align="center">
                    <Text fontSize="11px" color={colors.textSecondary}>
                      Google Reviews
                    </Text>
                    <Text fontSize="13px" color={colors.textPrimary} fontWeight="500">
                      4.8 stars — 97 reviews
                    </Text>
                  </Flex>
                </Box>
              </Box>
            </Flex>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════
            SECTION 2: MARQUEE STRIP
        ═══════════════════════════════════════════════════ */}
        <Box bg={colors.accent} h="44px" overflow="hidden" display="flex" alignItems="center">
          <Box
            display="flex"
            whiteSpace="nowrap"
            style={{
              animation: 'marquee 20s linear infinite',
            }}
          >
            {[...Array(4)].map((_, repeat) => (
              <Box key={repeat} display="flex" alignItems="center">
                {marqueeItems.map((item) => (
                  <Text
                    key={`${repeat}-${item}`}
                    as="span"
                    fontSize="18px"
                    color={colors.bg}
                    letterSpacing="0.1em"
                    mx={4}
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {item} ·
                  </Text>
                ))}
              </Box>
            ))}
          </Box>
        </Box>

        {/* ═══════════════════════════════════════════════════
            SECTION 3: SERVICES
        ═══════════════════════════════════════════════════ */}
        <Box bg={colors.bg} py="120px">
          <Container maxW="7xl">
            <AnimatedSection>
              <Flex
                justify="space-between"
                align={{ base: 'flex-start', md: 'flex-end' }}
                direction={{ base: 'column', md: 'row' }}
                gap={4}
                mb="60px"
              >
                <Text
                  fontSize="11px"
                  color={colors.accent}
                  letterSpacing="0.2em"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  WHAT WE DO
                </Text>
                <Text
                  fontSize={{ base: '36px', md: '64px' }}
                  color={colors.textPrimary}
                  lineHeight="1"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Complete Mobile Tyre Service
                </Text>
              </Flex>
            </AnimatedSection>

            {services.map((service, index) => (
              <AnimatedSection key={service.title} delay={index * 0.1}>
                <Box
                  borderBottomWidth="1px"
                  borderColor={colors.border}
                  py="48px"
                  transition="background 0.3s"
                  _hover={{ bg: colors.surface }}
                  cursor="pointer"
                >
                  <Flex
                    direction={{ base: 'column', md: 'row' }}
                    align={{ base: 'flex-start', md: 'center' }}
                    gap={{ base: 4, md: 0 }}
                  >
                    <Box flex={{ md: '0 0 40%' }}>
                      <Text
                        fontSize={{ base: '48px', md: '72px' }}
                        color={colors.border}
                        lineHeight="1"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {service.num}
                      </Text>
                    </Box>
                    <Box flex={{ md: '0 0 40%' }}>
                      <Text
                        fontSize={{ base: '24px', md: '32px' }}
                        color={colors.textPrimary}
                        mb={2}
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {service.title}
                      </Text>
                      <Text
                        fontSize="14px"
                        color={colors.textSecondary}
                        maxW="400px"
                        lineHeight="1.6"
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        {service.description}
                      </Text>
                    </Box>
                    <Flex flex={{ md: '0 0 20%' }} justify="flex-end" align="center" gap={4}>
                      <Text
                        fontSize={{ base: '20px', md: '28px' }}
                        color={colors.accent}
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {service.price}
                      </Text>
                      <Text
                        fontSize="24px"
                        color={colors.textSecondary}
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        →
                      </Text>
                    </Flex>
                  </Flex>
                </Box>
              </AnimatedSection>
            ))}
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════
            SECTION 4: HOW IT WORKS
        ═══════════════════════════════════════════════════ */}
        <Box bg={colors.surface} py="120px">
          <Container maxW="7xl">
            <AnimatedSection>
              <Text
                fontSize="11px"
                color={colors.accent}
                letterSpacing="0.2em"
                mb={4}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                THE PROCESS
              </Text>
              <Text
                fontSize={{ base: '36px', md: '64px', lg: '80px' }}
                color={colors.textPrimary}
                lineHeight="1"
                mb="80px"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Booked. Dispatched. Fixed.
              </Text>
            </AnimatedSection>

            <Box position="relative" ref={timelineRef}>
              {/* Connecting line */}
              <Box
                display={{ base: 'none', md: 'block' }}
                position="absolute"
                top="48px"
                left="0"
                right="0"
                h="1px"
                bg={colors.border}
              >
                <Box
                  h="1px"
                  bg={colors.accent}
                  style={{
                    width: timelineVisible ? '100%' : '0',
                    transition: 'width 1.5s ease-out',
                  }}
                />
              </Box>

              <Flex
                direction={{ base: 'column', md: 'row' }}
                gap={{ base: 12, md: 8 }}
              >
                {steps.map((step, index) => (
                  <AnimatedSection key={step.number} delay={index * 0.15}>
                    <Box
                      flex={1}
                      position="relative"
                      textAlign={{ base: 'left', md: 'center' }}
                      _hover={{ '& .step-number': { color: colors.accent } }}
                    >
                      <Text
                        className="step-number"
                        fontSize={{ base: '64px', md: '96px' }}
                        color={colors.card}
                        lineHeight="1"
                        mb={4}
                        transition="color 0.3s"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {step.number}
                      </Text>
                      <Text
                        fontSize={{ base: '22px', md: '28px' }}
                        color={colors.textPrimary}
                        mb={2}
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {step.title}
                      </Text>
                      <Text
                        fontSize="13px"
                        color={colors.textSecondary}
                        lineHeight="1.6"
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        {step.description}
                      </Text>
                    </Box>
                  </AnimatedSection>
                ))}
              </Flex>
            </Box>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════
            SECTION 5: TESTIMONIALS
        ═══════════════════════════════════════════════════ */}
        <Box bg={colors.bg} py="120px">
          <Container maxW="7xl">
            <AnimatedSection>
              <Text
                fontSize="11px"
                color={colors.accent}
                letterSpacing="0.2em"
                mb={4}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                WHAT THEY SAY
              </Text>
              <Text
                fontSize={{ base: '36px', md: '64px', lg: '80px' }}
                color={colors.textPrimary}
                lineHeight="1"
                mb="60px"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Real Reviews
              </Text>
            </AnimatedSection>

            <Box
              overflowX="auto"
              mx={{ base: -4, md: 0 }}
              px={{ base: 4, md: 0 }}
              css={{
                '&::-webkit-scrollbar': { display: 'none' },
                scrollbarWidth: 'none',
              }}
            >
              <Flex gap={6} pb={4}>
                {testimonials.map((t, i) => (
                  <Box
                    key={i}
                    minW={{ base: '300px', md: '360px' }}
                    bg={colors.surface}
                    borderWidth="1px"
                    borderColor={colors.border}
                    p="32px"
                    position="relative"
                    flexShrink={0}
                  >
                    {/* Large decorative quote */}
                    <Text
                      position="absolute"
                      top="16px"
                      left="24px"
                      fontSize="120px"
                      color={colors.card}
                      lineHeight="1"
                      userSelect="none"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      &ldquo;
                    </Text>
                    <Box position="relative" zIndex={1}>
                      <Text
                        fontSize="15px"
                        color={colors.textPrimary}
                        lineHeight="1.6"
                        mb="24px"
                        mt="40px"
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        {t.content}
                      </Text>
                      <Text
                        fontSize="13px"
                        color={colors.textSecondary}
                        mb={1}
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        {t.author}
                      </Text>
                      <Text
                        fontSize="13px"
                        color={colors.accent}
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        {t.rating}
                      </Text>
                    </Box>
                  </Box>
                ))}
              </Flex>
            </Box>

            <Text
              textAlign="center"
              fontSize="13px"
              color={colors.textSecondary}
              mt={10}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              4.8 stars based on 97 Google reviews
            </Text>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════
            SECTION 6: FAQ
        ═══════════════════════════════════════════════════ */}
        <Box bg={colors.surface} py="120px">
          <Container maxW="4xl">
            <AnimatedSection>
              <Text
                fontSize="11px"
                color={colors.accent}
                letterSpacing="0.2em"
                mb={4}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                COMMON QUESTIONS
              </Text>
              <Text
                fontSize={{ base: '36px', md: '64px', lg: '80px' }}
                color={colors.textPrimary}
                lineHeight="1"
                mb="60px"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                FAQ
              </Text>
            </AnimatedSection>

            <AnimatedSection delay={0.2}>
              {faqs.map((faq, index) => (
                <FAQItem key={index} question={faq.question} answer={faq.answer} />
              ))}
            </AnimatedSection>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════
            SECTION 7: CTA
        ═══════════════════════════════════════════════════ */}
        <Box bg={colors.accent} py="80px">
          <Container maxW="4xl" textAlign="center">
            <Text
              color={colors.bg}
              lineHeight="0.9"
              mb={6}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(48px, 8vw, 100px)',
              }}
            >
              STRANDED?
              <br />
              CALL NOW.
            </Text>
            <ChakraLink
              href={`tel:${PHONE_NUMBER.replace(/\s/g, '')}`}
              display="inline-block"
              color={colors.bg}
              mb={4}
              _hover={{ opacity: 0.7 }}
              transition="opacity 0.2s"
              fontSize={{ base: '32px', md: '56px' }}
              style={{
                fontFamily: 'var(--font-display)',
              }}
            >
              {PHONE_NUMBER}
            </ChakraLink>
            <Text
              fontSize="16px"
              color="rgba(0,0,0,0.6)"
              mb={8}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Or book online in under 3 minutes
            </Text>
            <Flex direction={{ base: 'column', sm: 'row' }} gap={4} justify="center">
              <ChakraLink
                href={`tel:${PHONE_NUMBER.replace(/\s/g, '')}`}
                px={8}
                py={4}
                bg={colors.bg}
                color={colors.accent}
                fontSize="20px"
                letterSpacing="0.05em"
                borderRadius="4px"
                transition="all 0.2s"
                _hover={{ opacity: 0.9 }}
                _active={{ transform: 'scale(0.98)' }}
                textAlign="center"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                CALL {PHONE_NUMBER}
              </ChakraLink>
              <ChakraLink
                asChild
                px={8}
                py={4}
                bg="transparent"
                color={colors.bg}
                fontSize="20px"
                letterSpacing="0.05em"
                borderRadius="4px"
                borderWidth="2px"
                borderColor={colors.bg}
                transition="all 0.2s"
                _hover={{ bg: 'rgba(10,10,10,0.1)' }}
                _active={{ transform: 'scale(0.98)' }}
                textAlign="center"
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
