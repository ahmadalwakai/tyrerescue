'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box,
  Container,
  Text,
  Flex,
  Input,
  Textarea,
  SimpleGrid,
  Grid,
  Link as ChakraLink,
} from '@chakra-ui/react';
import Link from 'next/link';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { FloatingContactBar } from '@/components/ui/FloatingContactBar';
import { colorTokens, inputProps, textareaProps } from '@/lib/design-tokens';
import { HomeImageShowcase } from '@/components/home/HomeImageShowcase';
import type { HomeSlide } from '@/components/home/homeImageSlides';
import { cities } from '@/lib/cities';
import { services as seoServices, serviceCities } from '@/lib/areas';
import { homepageFAQItems } from '@/lib/content/faq';

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
      'Flat tyre near me? Our emergency mobile tyre fitters respond across Glasgow and Edinburgh within 45 minutes, 24 hours a day, 7 days a week.',
    price: 'From £49',
  },
  {
    num: '02',
    title: 'Mobile Tyre Fitting',
    description:
      'New tyres fitted at your location. We are the mobile tyre shop that comes to you \u2014 at home, at work, or at the roadside across Glasgow.',
    price: 'From £20',
  },
  {
    num: '03',
    title: 'Puncture Repair',
    description:
      'Professional tyre repair near me service. Where possible we repair your tyre on the spot. Faster and cheaper than a full tyre replacement.',
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



const marqueeItems = [
  'EMERGENCY CALLOUT',
  'GLASGOW & EDINBURGH',
  '24 HOURS A DAY',
  'MOBILE TYRE FITTING',
  'PUNCTURE REPAIR',
  'QUALITY TYRES',
];

const cssKeyframes = `
  @keyframes marquee {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
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

type FallingSquareDepth = 'far' | 'mid' | 'accent';
type FallingSquareVariant = 'fill' | 'outline' | 'blur';

type FallingSquare = {
  id: string;
  x: number;
  size: 8 | 12 | 16 | 20 | 24;
  depth: FallingSquareDepth;
  variant: FallingSquareVariant;
  driftX: number;
  rotate: number;
  duration: number;
  delay: number;
};

const heroFallingSquares: FallingSquare[] = [
  // far — smallest, slowest, darkest, edges only
  { id: 'f1', x: 4,  size: 8,  depth: 'far', variant: 'fill',    driftX: 3,  rotate: 4,  duration: 38, delay: -5 },
  { id: 'f2', x: 14, size: 12, depth: 'far', variant: 'outline', driftX: -2, rotate: -3, duration: 34, delay: -18 },
  { id: 'f3', x: 88, size: 8,  depth: 'far', variant: 'fill',    driftX: -3, rotate: 3,  duration: 40, delay: -10 },
  { id: 'f4', x: 94, size: 12, depth: 'far', variant: 'outline', driftX: 2,  rotate: -2, duration: 36, delay: -26 },
  { id: 'f5', x: 8,  size: 8,  depth: 'far', variant: 'outline', driftX: 4,  rotate: -4, duration: 42, delay: -15 },
  { id: 'f6', x: 91, size: 8,  depth: 'far', variant: 'fill',    driftX: -2, rotate: 2,  duration: 37, delay: -32 },

  // mid — mixed black + dark orange tones, varied speed
  { id: 'm1', x: 78, size: 16, depth: 'mid', variant: 'fill',    driftX: -5, rotate: 5,  duration: 28, delay: -4 },
  { id: 'm2', x: 83, size: 20, depth: 'mid', variant: 'outline', driftX: 3,  rotate: -3, duration: 26, delay: -14 },
  { id: 'm3', x: 11, size: 16, depth: 'mid', variant: 'blur',    driftX: 4,  rotate: -4, duration: 30, delay: -8 },
  { id: 'm4', x: 19, size: 12, depth: 'mid', variant: 'fill',    driftX: -3, rotate: 3,  duration: 25, delay: -21 },
  { id: 'm5', x: 75, size: 16, depth: 'mid', variant: 'outline', driftX: -4, rotate: -2, duration: 27, delay: -12 },
  { id: 'm6', x: 9,  size: 20, depth: 'mid', variant: 'fill',    driftX: 3,  rotate: 4,  duration: 24, delay: -28 },

  // accent — orange, fewest, restrained
  { id: 'a1', x: 86, size: 16, depth: 'accent', variant: 'outline', driftX: -3, rotate: 3, duration: 22, delay: -6 },
  { id: 'a2', x: 7,  size: 12, depth: 'accent', variant: 'fill',    driftX: 2,  rotate: -2, duration: 24, delay: -16 },
];

function HeroFallingSquares() {
  return (
    <Box
      position="absolute"
      inset={0}
      zIndex={0}
      overflow="hidden"
      pointerEvents="none"
      aria-hidden
    >
      {heroFallingSquares.map((sq) => (
        <Box
          key={sq.id}
          as="span"
          position="absolute"
          top="-30px"
          display={{ base: sq.depth === 'far' ? 'none' : 'block', md: 'block' }}
          className={`hero-sq depth-${sq.depth} variant-${sq.variant}`}
          w={`${sq.size}px`}
          h={`${sq.size}px`}
          borderRadius="2px"
          style={{
            left: `${sq.x}%`,
            animationDuration: `${sq.duration}s`,
            animationDelay: `${sq.delay}s`,
            '--sq-dx': `${sq.driftX}px`,
            '--sq-rot': `${sq.rotate}deg`,
          } as React.CSSProperties}
        />
      ))}
    </Box>
  );
}

// ─── Glasgow O Letter Animation ─────────────────────────
function GlasgowO({ delay }: { delay: string }) {
  return (
    <Box
      as="span"
      display="inline-block"
      position="relative"
      w="1ch"
      verticalAlign="baseline"
    >
      <Box
        as="span"
        className="neon-char"
        position="absolute"
        top={0}
        left={0}
        w="100%"
        h="100%"
        style={{
          animation: `glasgowORollPath 9.6s cubic-bezier(0.22,1,0.36,1) ${delay} infinite, glasgowOLetterOpacity 9.6s ease-in-out ${delay} infinite, orangeNeon 3s ease-in-out ${delay} infinite`,
        }}
      >
        O
      </Box>

      <Box
        as="span"
        position="absolute"
        top={0}
        left={0}
        w="100%"
        h="100%"
        pointerEvents="none"
        style={{
          animation: `glasgowORollPath 9.6s cubic-bezier(0.22,1,0.36,1) ${delay} infinite, glasgowOTyreOpacity 9.6s ease-in-out ${delay} infinite`,
        }}
      >
        <Box
          as="span"
          display="inline-block"
          w="1.15ch"
          h="1.15em"
          style={{
            transform: 'translateY(-0.04em)',
            animation: `glasgowOTyreBounce 1.6s ease-in-out ${delay} infinite`,
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            width="100%"
            height="100%"
            style={{
              animation: 'tyreSpin 2s linear infinite',
              transformOrigin: 'center',
              filter: 'drop-shadow(0 0 3px rgba(249,115,22,0.6)) drop-shadow(0 0 8px rgba(249,115,22,0.35))',
            }}
          >
            <circle cx="50" cy="50" r="46" fill="#1A1A1A" />
            <circle cx="50" cy="50" r="46" fill="none" stroke="#2A2A2A" strokeWidth="2" />
            <circle cx="50" cy="50" r="46" fill="none" stroke="#F97316" strokeWidth="10" />
            <circle cx="50" cy="50" r="30" fill="#27272A" stroke="#3F3F46" strokeWidth="2" />
            <circle cx="50" cy="50" r="30" fill="none" stroke="#A1A1AA" strokeWidth="1" opacity="0.5" />
            {[0, 72, 144, 216, 288].map((angle) => {
              const rad = (angle * Math.PI) / 180;
              const x2 = 50 + 24 * Math.cos(rad);
              const y2 = 50 + 24 * Math.sin(rad);
              return (
                <line
                  key={angle}
                  x1="50"
                  y1="50"
                  x2={x2}
                  y2={y2}
                  stroke="#A1A1AA"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              );
            })}
            <circle cx="50" cy="50" r="6" fill="#F97316" />
            <circle cx="50" cy="50" r="3" fill="#09090B" />
            {Array.from({ length: 8 }).map((_, i) => (
              <rect
                key={i}
                x="47"
                y="3"
                width="6"
                height="10"
                fill="#F97316"
                opacity="0.55"
                transform={`rotate(${i * 45} 50 50)`}
              />
            ))}
          </svg>
        </Box>
      </Box>

      <Box as="span" visibility="hidden">O</Box>
    </Box>
  );
}

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
function FAQItem({ question, answer, index }: { question: string; answer: string; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const panelId = `faq-panel-${index}`;
  const headingId = `faq-heading-${index}`;

  return (
    <Box borderBottomWidth="1px" borderColor={colors.border}>
      <Flex
        as="button"
        id={headingId}
        role="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        justify="space-between"
        align="center"
        cursor="pointer"
        py="24px"
        w="100%"
        bg="transparent"
        border="none"
        textAlign="left"
        onClick={() => setIsOpen(!isOpen)}
        _hover={{ opacity: 0.8 }}
      >
        <Text
          as="span"
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
          className={`faq-toggle${isOpen ? ' open' : ''}`}
          aria-hidden="true"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          +
        </Text>
      </Flex>
      <Box
        ref={contentRef}
        id={panelId}
        role="region"
        aria-labelledby={headingId}
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

// ─── Contact Section ─────────────────────────────────────
function ContactSection() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  async function handleSubmit() {
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setStatus('submitting');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          message: message.trim(),
        }),
      });
      if (res.ok) {
        setStatus('success');
        setName(''); setEmail(''); setPhone(''); setMessage('');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }

  return (
    <Box bg={colors.bg} py="120px">
      <Container maxW="4xl">
        <AnimatedSection>
          <Text
            fontSize="11px"
            color={colors.accent}
            letterSpacing="0.2em"
            mb={4}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            GET IN TOUCH
          </Text>
          <Text
            as="h2"
            fontSize={{ base: '36px', md: '64px', lg: '80px' }}
            color={colors.textPrimary}
            lineHeight="1"
            mb="60px"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {'CONTACT US'.split('').map((ch, i) => (
              <span key={i} className={ch === ' ' ? undefined : 'wave-char'} style={{ display: 'inline-block', animationDelay: `${i * 0.06}s` }}>
                {ch === ' ' ? '\u00A0' : ch}
              </span>
            ))}
          </Text>
        </AnimatedSection>

        <AnimatedSection delay={0.2}>
          {status === 'success' ? (
            <Box bg={colors.surface} p={8} borderRadius="8px" borderWidth="1px" borderColor={colors.border} textAlign="center" role="status" aria-live="polite">
              <Text fontWeight="700" fontSize="lg" color={colors.textPrimary} mb={2}>
                Message sent
              </Text>
              <Text color={colors.textSecondary} fontSize="sm">
                We will get back to you as soon as possible.
              </Text>
            </Box>
          ) : (
            <Box bg={colors.surface} p={{ base: 6, md: 8 }} borderRadius="8px" borderWidth="1px" borderColor={colors.border}>
              <Flex gap={4} direction={{ base: 'column', md: 'row' }}>
                <Box flex="1" as="label" display="block">
                  <Text fontSize="13px" color={colors.textSecondary} mb="6px" fontWeight="500" style={{ fontFamily: 'var(--font-body)' }}>Name</Text>
                  <Input {...inputProps} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
                </Box>
                <Box flex="1" as="label" display="block">
                  <Text fontSize="13px" color={colors.textSecondary} mb="6px" fontWeight="500" style={{ fontFamily: 'var(--font-body)' }}>Email</Text>
                  <Input {...inputProps} placeholder="your@email.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Box>
              </Flex>
              <Box mt={4} as="label" display="block">
                <Text fontSize="13px" color={colors.textSecondary} mb="6px" fontWeight="500" style={{ fontFamily: 'var(--font-body)' }}>Phone (optional)</Text>
                <Input {...inputProps} placeholder="Your phone number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Box>
              <Box mt={4} as="label" display="block">
                <Text fontSize="13px" color={colors.textSecondary} mb="6px" fontWeight="500" style={{ fontFamily: 'var(--font-body)' }}>Message</Text>
                <Textarea
                  {...textareaProps}
                  placeholder="How can we help?"
                  value={message}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
                />
              </Box>
              {status === 'error' && (
                <Text color="#EF4444" fontSize="sm" mt={2} role="alert">Something went wrong. Please try again.</Text>
              )}
              <Box mt={6}>
                <Box
                  as="button"
                  bg={colors.accent}
                  color="white"
                  fontWeight="700"
                  fontSize="16px"
                  letterSpacing="0.05em"
                  borderRadius="4px"
                  px={8}
                  py={4}
                  w={{ base: '100%', md: 'auto' }}
                  cursor="pointer"
                  transition="all 0.2s"
                  _hover={{ bg: '#EA580C' }}
                  _active={{ transform: 'scale(0.98)' }}
                  onClick={handleSubmit}
                  aria-disabled={!name.trim() || !email.trim() || !message.trim() || status === 'submitting'}
                  pointerEvents={(!name.trim() || !email.trim() || !message.trim() || status === 'submitting') ? 'none' : 'auto'}
                  opacity={(!name.trim() || !email.trim() || !message.trim()) ? 0.5 : 1}
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {status === 'submitting' ? 'SENDING...' : 'SEND MESSAGE'}
                </Box>
              </Box>
            </Box>
          )}
        </AnimatedSection>
      </Container>
    </Box>
  );
}

// ─── Back to Top ─────────────────────────────────────────
function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!show) return null;

  return (
    <Box
      as="button"
      className="back-to-top"
      position="fixed"
      bottom="80px"
      right="24px"
      zIndex={40}
      w="44px"
      h="44px"
      bg={colors.accent}
      color={colors.bg}
      borderRadius="4px"
      display="flex"
      alignItems="center"
      justifyContent="center"
      cursor="pointer"
      opacity={show ? 1 : 0}
      border="none"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      style={{ fontFamily: 'var(--font-display)', fontSize: '20px' }}
    >
      ↑
    </Box>
  );
}

// ─── Main Component ──────────────────────────────────────
export function HomePage({ heroSlides }: { heroSlides?: HomeSlide[] }) {
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

      <Box as="main" id="main-content" flex={1}>
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
          <HeroFallingSquares />
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
                    overflow: 'hidden',
                  }}
                >
                  <Text
                    as="h1"
                    color={colors.textPrimary}
                    lineHeight="0.92"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'clamp(52px, 10vw, 140px)',
                      animation: 'slideInLeft 0.7s cubic-bezier(0.16,1,0.3,1) 0.2s both',
                    }}
                  >
                    {'GLASGOW'.split('').map((ch, i) => {
                      if (ch === 'O' && i === 5) {
                        return <GlasgowO key={i} delay={`${i * 0.12}s`} />;
                      }

                      return (
                        <Box as="span" key={i} className="neon-char" style={{ animationDelay: `${i * 0.12}s` }}>
                          {ch}
                        </Box>
                      );
                    })}
                  </Text>
                  <Text
                    as="span"
                    display="block"
                    color={colors.textPrimary}
                    lineHeight="0.92"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'clamp(52px, 10vw, 140px)',
                      animation: 'slideInRight 0.7s cubic-bezier(0.16,1,0.3,1) 0.45s both',
                    }}
                  >
                    {'EDINBURGH'.split('').map((ch, i) => (
                      <span key={i} className="neon-char wave-char" style={{ animationDelay: `${(i + 7) * 0.12}s, ${i * 0.08}s` }}>
                        {ch}
                      </span>
                    ))}
                  </Text>
                  <Text
                    as="span"
                    display="block"
                    color={colors.textPrimary}
                    lineHeight="0.92"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'clamp(52px, 10vw, 140px)',
                      animation: 'slideInLeft 0.7s cubic-bezier(0.16,1,0.3,1) 0.7s both',
                    }}
                  >
                    {'DUNDEE'.split('').map((ch, i) => (
                      <span key={i} className="neon-char wave-char" style={{ animationDelay: `${(i + 16) * 0.12}s, ${i * 0.08}s` }}>
                        {ch}
                      </span>
                    ))}
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
                  gap={{ base: 3, md: 4 }}
                  mt="40px"
                  flexWrap="wrap"
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
                  <ChakraLink
                    href="https://wa.me/447423262955"
                    target="_blank"
                    rel="noopener noreferrer"
                    px="32px"
                    h="56px"
                    display="inline-flex"
                    alignItems="center"
                    justifyContent="center"
                    bg="transparent"
                    color="#25D366"
                    fontSize="20px"
                    letterSpacing="0.05em"
                    borderRadius="4px"
                    borderWidth="1px"
                    borderColor="#25D366"
                    transition="all 0.2s"
                    _hover={{ bg: 'rgba(37,211,102,0.08)' }}
                    style={{
                      fontFamily: 'var(--font-display)',
                      animation: 'fadeUp 0.6s ease-out 0.6s both, neonFlash 4s ease-in-out 2s infinite',
                    }}
                  >
                    WHATSAPP US
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

                {/* Hero image showcase */}
                <Box mb={{ base: 6, lg: 8 }} style={{ animation: 'slideInRight 0.8s ease-out 0.2s both' }}>
                  <HomeImageShowcase slides={heroSlides} />
                </Box>

                <Box
                  style={{
                    filter: 'drop-shadow(0 0 6px rgba(249,115,22,0.3)) drop-shadow(0 0 18px rgba(249,115,22,0.12))',
                  }}
                >
                <Box
                  bg={colors.card}
                  borderWidth="1px"
                  borderColor="rgba(249,115,22,0.35)"
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
                    style={{ fontFamily: 'var(--font-body)', animation: 'fadeUp 0.5s ease-out 0.6s both' }}
                  >
                    OUR WORKSHOP
                  </Text>
                  <Text
                    fontSize="36px"
                    color={colors.textPrimary}
                    lineHeight="1.1"
                    mb={1}
                    style={{ fontFamily: 'var(--font-display)', animation: 'fadeUp 0.5s ease-out 0.7s both' }}
                  >
                    {'MOBILE TYRE FITTING'.split('').map((ch, i) => (
                      <span key={i} className={ch === ' ' ? undefined : 'wave-char'} style={{ display: 'inline-block', animationDelay: `${i * 0.06}s` }}>
                        {ch === ' ' ? '\u00A0' : ch}
                      </span>
                    ))}
                  </Text>
                  <Text fontSize="13px" color={colors.textSecondary} mb={0} style={{ animation: 'fadeUp 0.5s ease-out 0.8s both' }}>
                    {'Duke Street Tyres'.split('').map((ch, i) => (
                      <span key={i} className={ch === ' ' ? undefined : 'wave-char'} style={{ display: 'inline-block', animationDelay: `${i * 0.06}s` }}>
                        {ch === ' ' ? '\u00A0' : ch}
                      </span>
                    ))}
                  </Text>

                  <Box h="1px" bg={colors.border} my="24px" style={{ animation: 'lineGrow 0.5s ease-out 0.9s both' }} />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }}>
                    <div>
                      <Text fontSize="14px" color={colors.textPrimary} lineHeight="1.5" style={{ animation: 'fadeUp 0.4s ease-out 1.0s both' }}>
                        {'3, 10 Gateside St'.split('').map((ch, i) => (
                          <span key={i} className={ch === ' ' ? undefined : 'wave-char'} style={{ display: 'inline-block', animationDelay: `${i * 0.06}s` }}>
                            {ch === ' ' ? '\u00A0' : ch}
                          </span>
                        ))}
                      </Text>
                      <Text fontSize="14px" color={colors.textPrimary} mb={4} style={{ animation: 'fadeUp 0.4s ease-out 1.05s both' }}>
                        {'Glasgow G31 1PD'.split('').map((ch, i) => (
                          <span key={i} className={ch === ' ' ? undefined : 'wave-char'} style={{ display: 'inline-block', animationDelay: `${i * 0.06}s` }}>
                            {ch === ' ' ? '\u00A0' : ch}
                          </span>
                        ))}
                      </Text>
                    </div>
                    <img
                      src="/tyre-fitters.png"
                      alt="Tyre Fitters"
                      style={{ height: '140px', width: 'auto', objectFit: 'contain', filter: 'invert(1)', opacity: 0.85, animation: 'scaleIn 0.6s ease-out 1.0s both, floatGently 3s ease-in-out 1.6s infinite', flexShrink: 0 }}
                    />
                  </div>

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
                      animation: 'fadeUp 0.5s ease-out 1.1s both',
                    }}
                  >
                    {PHONE_NUMBER.split('').map((ch, i) => (
                      <span key={i} className={ch === ' ' ? undefined : 'wave-char'} style={{ display: 'inline-block', animationDelay: `${i * 0.06}s` }}>
                        {ch === ' ' ? '\u00A0' : ch}
                      </span>
                    ))}
                  </ChakraLink>

                  <Text fontSize="12px" color={colors.textSecondary} style={{ animation: 'fadeUp 0.4s ease-out 1.2s both' }}>
                    Open 8am to Midnight, Every Day
                  </Text>

                  <Box h="1px" bg={colors.border} my="24px" style={{ animation: 'lineGrow 0.5s ease-out 1.3s both' }} />

                  <Flex justify="space-between" align="center" style={{ animation: 'fadeUp 0.4s ease-out 1.4s both' }}>
                    <Text fontSize="11px" color={colors.textSecondary}>
                      Google Reviews
                    </Text>
                    <Text fontSize="13px" color={colors.textPrimary} fontWeight="500">
                      4.8 stars — 97 reviews
                    </Text>
                  </Flex>
                </Box>
                </Box>
              </Box>
            </Flex>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════
            SECTION 2: MARQUEE STRIP
        ═══════════════════════════════════════════════════ */}
        <Box bg={colors.accent} h="44px" overflow="hidden" display="flex" alignItems="center" className="marquee-container">
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
            SECTION 3: TRUST PILLARS
        ═══════════════════════════════════════════════════ */}
        <Box id="trust" bg={colors.bg} py={{ base: '60px', md: '80px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
          <AnimatedSection>
            <SimpleGrid columns={{ base: 2, md: 4 }} gap={{ base: 6, md: 0 }}>
              <Box textAlign="center">
                <Text fontSize={{ base: '48px', md: '64px' }} color={colors.accent} lineHeight="1" style={{ fontFamily: 'var(--font-display)' }}>£2M</Text>
                <Text fontSize="14px" fontWeight="600" color={colors.textPrimary} mt={2} style={{ fontFamily: 'var(--font-body)' }}>Public Liability</Text>
                <Text fontSize="12px" color={colors.textSecondary} maxW="160px" mx="auto" mt={1} style={{ fontFamily: 'var(--font-body)' }}>All fitters fully insured</Text>
              </Box>
              <Box textAlign="center">
                <Text fontSize={{ base: '48px', md: '64px' }} color={colors.accent} lineHeight="1" style={{ fontFamily: 'var(--font-display)' }}>45 MIN</Text>
                <Text fontSize="14px" fontWeight="600" color={colors.textPrimary} mt={2} style={{ fontFamily: 'var(--font-body)' }}>Avg Response Time</Text>
                <Text fontSize="12px" color={colors.textSecondary} maxW="160px" mx="auto" mt={1} style={{ fontFamily: 'var(--font-body)' }}>Emergency callouts Glasgow &amp; Edinburgh</Text>
              </Box>
              <Box textAlign="center">
                <Text fontSize={{ base: '48px', md: '64px' }} color={colors.accent} lineHeight="1" style={{ fontFamily: 'var(--font-display)' }}>10+</Text>
                <Text fontSize="14px" fontWeight="600" color={colors.textPrimary} mt={2} style={{ fontFamily: 'var(--font-body)' }}>Years Experience</Text>
                <Text fontSize="12px" color={colors.textSecondary} maxW="160px" mx="auto" mt={1} style={{ fontFamily: 'var(--font-body)' }}>Duke Street Tyres, est. 2014</Text>
              </Box>
              <Box textAlign="center">
                <Text fontSize={{ base: '48px', md: '64px' }} color={colors.accent} lineHeight="1" style={{ fontFamily: 'var(--font-display)' }}>4.8</Text>
                <Text fontSize="14px" fontWeight="600" color={colors.textPrimary} mt={2} style={{ fontFamily: 'var(--font-body)' }}>Google Rating</Text>
                <Text fontSize="12px" color={colors.textSecondary} maxW="160px" mx="auto" mt={1} style={{ fontFamily: 'var(--font-body)' }}>97 verified reviews</Text>
              </Box>
            </SimpleGrid>
            <Box h="1px" bg={colors.border} mt={10} />
          </AnimatedSection>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════
            SECTION 3: SERVICES
        ═══════════════════════════════════════════════════ */}
        <Box id="services" bg={colors.bg} py="120px">
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
                <Box>
                  <Text
                    as="h2"
                    fontSize={{ base: '36px', md: '64px' }}
                    color={colors.textPrimary}
                    lineHeight="1"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {'Complete Mobile Tyre Service'.split('').map((ch, i) => (
                      <span key={i} className={ch === ' ' ? undefined : 'wave-char'} style={{ display: 'inline-block', animationDelay: `${i * 0.06}s` }}>
                        {ch === ' ' ? '\u00A0' : ch}
                      </span>
                    ))}
                  </Text>
                  <Box h="2px" w="60px" bg={colors.accent} mt={3} />
                </Box>
              </Flex>
            </AnimatedSection>

            {services.map((service, index) => (
              <AnimatedSection key={service.title} delay={index * 0.1}>
                <Box
                  className="service-row"
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
                        className="service-num"
                        fontSize={{ base: '48px', md: '72px' }}
                        color={colors.border}
                        lineHeight="1"
                        transition="color 0.3s"
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
                        className="service-arrow"
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
            SECTION: GUARANTEE
        ═══════════════════════════════════════════════════ */}
        <Box id="guarantee" bg={colors.surface} py={{ base: '60px', md: '80px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
          <AnimatedSection>
            <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={{ base: 10, md: 16 }} alignItems="flex-start">
              <Flex direction="column" gap={4} align="flex-start">
                <Text fontSize="11px" color={colors.accent} letterSpacing="0.15em" style={{ fontFamily: 'var(--font-body)' }}>OUR GUARANTEE</Text>
                <Text as="h2" fontSize={{ base: '40px', md: '56px' }} color={colors.textPrimary} lineHeight="1" style={{ fontFamily: 'var(--font-display)' }}>
                  {'WE STAND BEHIND EVERY JOB.'.split('').map((ch, i) => (
                    <span key={i} className={ch === ' ' ? undefined : 'wave-char'} style={{ display: 'inline-block', animationDelay: `${i * 0.06}s` }}>
                      {ch === ' ' ? '\u00A0' : ch}
                    </span>
                  ))}
                </Text>
                <Text fontSize="15px" color={colors.textSecondary} lineHeight="1.7" style={{ fontFamily: 'var(--font-body)' }}>
                  If you are not completely satisfied with our work, we will return and put it right at no extra charge. No arguments, no hassle.
                </Text>
                <Box mt={4}>
                  <Text fontSize="13px" color={colors.textSecondary} style={{ fontFamily: 'var(--font-body)' }}>
                    Call us anytime:{' '}
                    <ChakraLink href="tel:01412660690" color={colors.accent} _hover={{ opacity: 0.8 }}>0141 266 0690</ChakraLink>
                  </Text>
                </Box>
              </Flex>
              <Flex direction="column" gap={4}>
                {[
                  { title: 'Quality Parts Only', body: 'We only fit tyres from reputable manufacturers with full EU tyre ratings. No inferior products.' },
                  { title: 'Transparent Pricing', body: 'The price you see before you pay is the price you pay. No hidden fees, no surprise charges.' },
                  { title: 'Trained Fitters', body: 'All our mobile fitters are trained and experienced professionals. Your vehicle is in safe hands.' },
                ].map((card) => (
                  <Box
                    key={card.title}
                    bg={colors.card}
                    borderLeftWidth="3px"
                    borderColor={colors.accent}
                    borderRadius="0 8px 8px 0"
                    p={{ base: '16px', md: '20px' }}
                  >
                    <Text fontSize="15px" fontWeight="600" color={colors.textPrimary} style={{ fontFamily: 'var(--font-body)' }}>{card.title}</Text>
                    <Text fontSize="13px" color={colors.textSecondary} mt="4px" style={{ fontFamily: 'var(--font-body)' }}>{card.body}</Text>
                  </Box>
                ))}
              </Flex>
            </Grid>
          </AnimatedSection>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════
            SECTION 4: HOW IT WORKS
        ═══════════════════════════════════════════════════ */}
        <Box id="how-it-works" bg={colors.surface} py="120px">
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
                as="h2"
                fontSize={{ base: '36px', md: '64px', lg: '80px' }}
                color={colors.textPrimary}
                lineHeight="1"
                mb="80px"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {'Booked. Dispatched. Fixed.'.split('').map((ch, i) => (
                  <span key={i} className={ch === ' ' ? undefined : 'wave-char'} style={{ display: 'inline-block', animationDelay: `${i * 0.06}s` }}>
                    {ch === ' ' ? '\u00A0' : ch}
                  </span>
                ))}
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
                        {step.number.split('').map((ch: string, i: number) => (
                          <span key={i} className={ch === ' ' ? undefined : 'wave-char'} style={{ display: 'inline-block', animationDelay: `${i * 0.06}s` }}>
                            {ch === ' ' ? '\u00A0' : ch}
                          </span>
                        ))}
                      </Text>
                      <Text
                        fontSize={{ base: '22px', md: '28px' }}
                        color={colors.textPrimary}
                        mb={2}
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {step.title.split('').map((ch: string, i: number) => (
                          <span key={i} className={ch === ' ' ? undefined : 'wave-char'} style={{ display: 'inline-block', animationDelay: `${i * 0.06}s` }}>
                            {ch === ' ' ? '\u00A0' : ch}
                          </span>
                        ))}
                      </Text>
                      <Text
                        fontSize="13px"
                        color={colors.textSecondary}
                        lineHeight="1.6"
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        {step.description.split('').map((ch: string, i: number) => (
                          <span key={i} className={ch === ' ' ? undefined : 'wave-char'} style={{ display: 'inline-block', animationDelay: `${i * 0.06}s` }}>
                            {ch === ' ' ? '\u00A0' : ch}
                          </span>
                        ))}
                      </Text>
                    </Box>
                  </AnimatedSection>
                ))}
              </Flex>
            </Box>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════
            SECTION: AREAS WE COVER
        ═══════════════════════════════════════════════════ */}
        <Box id="areas" bg={colors.surface} py={{ base: '50px', md: '70px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
          <AnimatedSection>
            <Text
              as="h2"
              fontSize={{ base: '36px', md: '56px' }}
              color={colors.textPrimary}
              mb={2}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {'AREAS WE COVER'.split('').map((ch, i) => (
                <span key={i} className={ch === ' ' ? undefined : 'wave-char'} style={{ display: 'inline-block', animationDelay: `${i * 0.06}s` }}>
                  {ch === ' ' ? '\u00A0' : ch}
                </span>
              ))}
            </Text>
            <Box h="2px" w="60px" bg={colors.accent} mb={8} />
            <Flex wrap="wrap" gap={3}>
              {cities.map((city) => (
                <ChakraLink
                  key={city.slug}
                  asChild
                  _hover={{ borderColor: colors.accent, color: colors.accent }}
                  transition="all 0.2s"
                >
                  <Link href={`/services/${city.slug}`}>
                    <Box
                      bg={colors.card}
                      borderWidth="1px"
                      borderColor={colors.border}
                      borderRadius="4px"
                      px={5}
                      py="10px"
                    >
                      <Text fontSize="13px" color={colors.textSecondary} style={{ fontFamily: 'var(--font-body)' }}>{city.name}</Text>
                    </Box>
                  </Link>
                </ChakraLink>
              ))}
            </Flex>
          </AnimatedSection>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════
            SECTION: OUR SERVICES BY LOCATION
        ═══════════════════════════════════════════════════ */}
        <Box bg={colors.bg} py={{ base: '60px', md: '80px' }} px={{ base: 4, md: 8 }} borderTop={`1px solid ${colors.border}`}>
          <Container maxW="1200px">
            <Text
              as="h2"
              fontSize={{ base: '36px', md: '48px' }}
              color={colors.textPrimary}
              mb={10}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              OUR SERVICES BY LOCATION
            </Text>
            {seoServices.map((svc) => {
              const citiesForService = serviceCities.map((slug) => cities.find((c) => c.slug === slug)).filter(Boolean);
              return (
                <Box key={svc.slug} mb={6}>
                  <Text fontSize="14px" fontWeight="600" color={colors.textPrimary} mb={2} style={{ fontFamily: 'var(--font-body)' }}>
                    {svc.name}
                  </Text>
                  <Flex wrap="wrap" gap={2}>
                    {citiesForService.map((city) => (
                      <ChakraLink key={city!.slug} asChild _hover={{ borderColor: colors.accent, color: colors.accent }} transition="all 0.2s">
                        <Link href={`/${svc.slug}/${city!.slug}`}>
                          <Box bg={colors.surface} borderWidth="1px" borderColor={colors.border} borderRadius="4px" px={3} py="6px">
                            <Text fontSize="12px" color={colors.textSecondary} style={{ fontFamily: 'var(--font-body)' }}>{city!.name}</Text>
                          </Box>
                        </Link>
                      </ChakraLink>
                    ))}
                  </Flex>
                </Box>
              );
            })}
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════
            SECTION 5: TESTIMONIALS
        ═══════════════════════════════════════════════════ */}
        <Box id="testimonials" bg={colors.bg} py="120px">
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
                as="h2"
                fontSize={{ base: '36px', md: '64px', lg: '80px' }}
                color={colors.textPrimary}
                lineHeight="1"
                mb={2}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Real Reviews
              </Text>
              <Box h="2px" w="60px" bg={colors.accent} mb="60px" />
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
                    className="testimonial-card"
                    minW={{ base: '300px', md: '360px' }}
                    bg={colors.surface}
                    borderWidth="1px"
                    borderColor={colors.border}
                    borderTopWidth="3px"
                    borderTopColor={colors.accent}
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
            SECTION: ABOUT US
        ═══════════════════════════════════════════════════ */}
        <Box id="about" bg={colors.bg} py={{ base: '60px', md: '80px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="1200px">
          <AnimatedSection>
            <Grid templateColumns={{ base: '1fr', md: '2fr 3fr' }} gap={{ base: 10, md: 16 }}>
              <Flex direction="column" gap={5} align="flex-start">
                <Text fontSize="11px" color={colors.accent} letterSpacing="0.15em" style={{ fontFamily: 'var(--font-body)' }}>ABOUT US</Text>
                <Text as="h2" fontSize={{ base: '40px', md: '56px' }} color={colors.textPrimary} lineHeight="1" style={{ fontFamily: 'var(--font-display)' }}>
                  {'DUKE STREET TYRES.'.split('').map((ch, i) => (
                    <span key={i} className={ch === ' ' ? undefined : 'wave-char'} style={{ display: 'inline-block', animationDelay: `${i * 0.06}s` }}>
                      {ch === ' ' ? '\u00A0' : ch}
                    </span>
                  ))}
                </Text>
                <Text fontSize="15px" color={colors.textSecondary} lineHeight="1.7" style={{ fontFamily: 'var(--font-body)' }}>
                  Based in Glasgow&apos;s East End, Duke Street Tyres has been providing mobile tyre fitting in Glasgow since 2014. Whether you need tyres near me, emergency tyre repair, or a scheduled mobile tyre fitter, our service brings the expertise of a full tyre shop to your exact location.
                </Text>
                <Text fontSize="15px" color={colors.textSecondary} lineHeight="1.7" style={{ fontFamily: 'var(--font-body)' }}>
                  We are a real local tyre shop in Glasgow with a physical workshop you can visit. Every job is carried out by our own trained mobile tyre fitters &mdash; not contractors.
                </Text>
                <Box bg={colors.surface} borderWidth="1px" borderColor={colors.border} borderRadius="8px" p={4} mt={2}>
                  <Text fontSize="14px" color={colors.textPrimary} style={{ fontFamily: 'var(--font-body)' }}>3, 10 Gateside St, Glasgow G31 1PD</Text>
                  <Text fontSize="12px" color={colors.textSecondary} mt="4px" style={{ fontFamily: 'var(--font-body)' }}>Open 8am to Midnight, Every Day</Text>
                </Box>
              </Flex>
              <Flex direction="column" gap={3}>
                {[
                  { title: 'Established 2014', sub: 'Over a decade serving Glasgow drivers' },
                  { title: 'Glasgow Based, Scotland Wide', sub: 'Workshop in Parkhead, coverage across Scotland' },
                  { title: 'Fully Insured and Licensed', sub: '£2 million public liability insurance' },
                ].map((card) => (
                  <Box
                    key={card.title}
                    bg={colors.card}
                    borderLeftWidth="3px"
                    borderColor={colors.accent}
                    borderRadius="0 8px 8px 0"
                    p={5}
                  >
                    <Text fontSize="15px" fontWeight="600" color={colors.textPrimary} style={{ fontFamily: 'var(--font-body)' }}>{card.title}</Text>
                    <Text fontSize="13px" color={colors.textSecondary} mt="4px" style={{ fontFamily: 'var(--font-body)' }}>{card.sub}</Text>
                  </Box>
                ))}
              </Flex>
            </Grid>
          </AnimatedSection>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════
            SECTION: CONTACT
        ═══════════════════════════════════════════════════ */}
        <ContactSection />

        {/* ═══════════════════════════════════════════════════
            SECTION: FAQ
        ═══════════════════════════════════════════════════ */}
        <Box id="faq" bg={colors.surface} py="120px">
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
                as="h2"
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
              {homepageFAQItems.map((faq, index) => (
                <FAQItem key={faq.id} index={index} question={faq.question} answer={faq.answer} />
              ))}
            </AnimatedSection>
          </Container>
        </Box>

        {/* ═══════════════════════════════════════════════════
            SECTION: CTA
        ═══════════════════════════════════════════════════ */}
        <AnimatedSection>
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
        </AnimatedSection>
      </Box>

      {/* Back to Top */}
      <BackToTop />

      <Footer />
      <FloatingContactBar />
    </Box>
  );
}
