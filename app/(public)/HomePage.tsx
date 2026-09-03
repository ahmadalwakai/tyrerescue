'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Container,
  Text,
  Flex,
  Input,
  Textarea,
  SimpleGrid,
  Grid,
  Image,
  Button,
  Link as ChakraLink,
} from '@chakra-ui/react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { Footer } from '@/components/ui/Footer';
import { colorTokens, inputProps, textareaProps } from '@/lib/design-tokens';
import { cities } from '@/lib/cities';
import { services as seoServices, serviceCities } from '@/lib/areas';
import {
  SERVICE_PRICING,
  PRICING_DISCLAIMER,
  PRICING_DISCLAIMER_HREF,
} from '@/lib/pricing';
import { homepageFAQItems } from '@/lib/content/faq';
import { TrustpilotReviewCollector } from '@/components/ui/TrustpilotReviewCollector';
import { trackCallClick, trackContactSubmit } from '@/lib/analytics/gtag';
import { AIOptimizedSection } from '@/components/seo/AIOptimizedSection';
import { HONEYPOT_FIELD } from '@/lib/security/honeypot';

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
const PHONE_HREF = `tel:${PHONE_NUMBER.replace(/\s/g, '')}`;
const HERO_BACKGROUND_SRC = '/images/home/slide-2.webp';

const heroHeadlineLines = [
  ['Emergency', 'Mobile'],
  ['Tyre', 'Fitting'],
  ['Across', 'Scotland'],
];

const heroTrustChips = [
  '★★★★★ 4.9 Google',
  '45 min - 1 hour',
  'All of Scotland',
  'Home & Work',
];

const heroMenuItems = [
  { label: 'Emergency', href: '/emergency' },
  { label: 'Book Online', href: '/book' },
  { label: 'Instant Quote', href: '/quote' },
  { label: 'Track Booking', href: '/tracking' },
  { label: 'Contact', href: '/contact' },
];

const services = [
  {
    num: '01',
    title: 'Emergency Callout',
    description:
      'Flat tyre anywhere in Scotland? Our emergency mobile tyre fitters respond across the whole of Scotland, 24 hours a day, 7 days a week. Glasgow and Edinburgh typically within 45 minutes.',
    price: SERVICE_PRICING.emergency.label,
  },
  {
    num: '02',
    title: 'Mobile Tyre Fitting',
    description:
      'New tyres fitted at your location anywhere in Scotland. We are the mobile tyre shop that comes to you — at home, at work, or at the roadside across Glasgow, Edinburgh, Aberdeen, Inverness and beyond.',
    price: SERVICE_PRICING.fitting.label,
  },
  {
    num: '03',
    title: 'Puncture Repair',
    description:
      'Professional tyre repair near me service. Where possible we repair your tyre on the spot. Faster and cheaper than a full tyre replacement.',
    price: SERVICE_PRICING.punctureRepair.label,
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
  'ALL OF SCOTLAND',
  '24 HOURS A DAY',
  'FULLY INSURED',
  'GLASGOW TO SHETLAND',
  'MOBILE TYRE FITTING',
  'PUNCTURE REPAIR',
  'QUALITY TYRES',
];

interface PartnerCompany {
  name: string;
  url: string;
  badges: string[];
  description: string;
}

const partnerCompanies: PartnerCompany[] = [
  {
    name: 'Speedy Van',
    url: 'https://www.speedy-van.co.uk/',
    badges: ['24/7 Availability', 'GPS-Tracked Fleet'],
    description: 'A reliable delivery partner assisting with tyre logistics across central Scotland.',
  },
  {
    name: 'VanJet',
    url: 'https://www.van-jet.com/',
    badges: ['Same-Day Delivery', 'Nationwide Coverage'],
    description: 'Supporting our emergency callout operations with rapid courier services.',
  },
  {
    name: 'VanItGo',
    url: 'https://www.vanitgo.com/',
    badges: ['Express Service', 'Eco-Friendly Fleet'],
    description: 'Helping us maintain fast turnaround times for scheduled mobile tyre fitting.',
  },
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
  @keyframes trCallCardBreathe {
    0%, 100% {
      transform: translateZ(0) scale(1);
      box-shadow: 0 24px 64px rgba(249,115,22,0.44), 0 0 0 1px rgba(255,255,255,0.22) inset;
    }
    50% {
      transform: translateZ(0) scale(1.018);
      box-shadow: 0 30px 82px rgba(249,115,22,0.66), 0 0 0 7px rgba(249,115,22,0.13), 0 0 0 1px rgba(255,255,255,0.28) inset;
    }
  }
  @keyframes trCallSweep {
    0%, 38% { transform: translateX(-155%) skewX(-18deg); opacity: 0; }
    48% { opacity: 0.65; }
    68%, 100% { transform: translateX(255%) skewX(-18deg); opacity: 0; }
  }
  @keyframes trCallRing {
    0% { opacity: 0.58; transform: scale(0.98); }
    65%, 100% { opacity: 0; transform: scale(1.08); }
  }
  @keyframes trPhoneRing {
    0%, 100% { transform: rotate(0deg) scale(1); }
    8% { transform: rotate(-12deg) scale(1.05); }
    16% { transform: rotate(12deg) scale(1.05); }
    24% { transform: rotate(-8deg) scale(1.04); }
    32% { transform: rotate(8deg) scale(1.04); }
    42% { transform: rotate(0deg) scale(1); }
  }
  @keyframes trCallTextGlow {
    0%, 100% { text-shadow: none; }
    50% { text-shadow: 0 0 18px rgba(9,9,11,0.28); }
  }
  @keyframes trBookCardBreathe {
    0%, 100% {
      transform: translateZ(0) scale(1);
      box-shadow: 0 16px 42px rgba(0,0,0,0.34), 0 0 0 1px rgba(249,115,22,0.48) inset;
    }
    50% {
      transform: translateZ(0) scale(1.012);
      box-shadow: 0 20px 56px rgba(249,115,22,0.28), 0 0 0 5px rgba(249,115,22,0.10), 0 0 0 1px rgba(249,115,22,0.72) inset;
    }
  }
  @keyframes trBookIconLift {
    0%, 100% { transform: translateY(0) rotate(0deg) scale(1); }
    18% { transform: translateY(-2px) rotate(-3deg) scale(1.04); }
    36% { transform: translateY(0) rotate(3deg) scale(1.02); }
    52% { transform: translateY(-1px) rotate(0deg) scale(1); }
  }
  @keyframes trBookArrowNudge {
    0%, 100% { transform: translateX(0); }
    50% { transform: translateX(5px); }
  }
  @keyframes trBookTextGlow {
    0%, 100% { text-shadow: none; }
    50% { text-shadow: 0 0 16px rgba(249,115,22,0.5); }
  }
  .tr-call-attention-card {
    animation: trCallCardBreathe 2.15s ease-in-out infinite;
    will-change: transform, box-shadow;
  }
  .tr-call-attention-card:hover {
    animation-play-state: paused;
  }
  .tr-call-attention-sweep {
    position: absolute;
    top: -45%;
    bottom: -45%;
    left: 0;
    width: 36%;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.42) 48%, transparent 100%);
    pointer-events: none;
    animation: trCallSweep 2.75s ease-in-out infinite;
    z-index: 1;
  }
  .tr-call-attention-ring {
    position: absolute;
    inset: 5px;
    border-radius: inherit;
    border: 2px solid rgba(255,255,255,0.38);
    pointer-events: none;
    animation: trCallRing 2.15s ease-out infinite;
    z-index: 1;
  }
  .tr-call-attention-icon {
    animation: trPhoneRing 2.15s ease-in-out infinite;
    transform-origin: center;
    z-index: 2;
  }
  .tr-call-attention-text {
    animation: trCallTextGlow 2.15s ease-in-out infinite;
  }
  .tr-book-attention-card {
    animation: trBookCardBreathe 2.15s ease-in-out infinite;
    will-change: transform, box-shadow;
  }
  .tr-book-attention-card:hover {
    animation-play-state: paused;
  }
  .tr-book-attention-sweep {
    position: absolute;
    top: -45%;
    bottom: -45%;
    left: 0;
    width: 34%;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.24) 40%, rgba(249,115,22,0.42) 52%, transparent 100%);
    pointer-events: none;
    animation: trCallSweep 2.75s ease-in-out infinite;
    z-index: 1;
  }
  .tr-book-attention-ring {
    position: absolute;
    inset: 5px;
    border-radius: inherit;
    border: 1px solid rgba(249,115,22,0.48);
    pointer-events: none;
    animation: trCallRing 2.15s ease-out infinite;
    z-index: 1;
  }
  .tr-book-attention-icon {
    animation: trBookIconLift 2.15s ease-in-out infinite;
    transform-origin: center;
    z-index: 2;
  }
  .tr-book-attention-text {
    animation: trBookTextGlow 2.15s ease-in-out infinite;
  }
  .tr-book-attention-arrow {
    animation: trBookArrowNudge 1.2s ease-in-out infinite;
    display: inline-flex;
    transform-origin: center;
  }
  @media (prefers-reduced-motion: reduce) {
    .tr-call-attention-card,
    .tr-call-attention-sweep,
    .tr-call-attention-ring,
    .tr-call-attention-icon,
    .tr-call-attention-text,
    .tr-book-attention-card,
    .tr-book-attention-sweep,
    .tr-book-attention-ring,
    .tr-book-attention-icon,
    .tr-book-attention-text,
    .tr-book-attention-arrow {
      animation: none !important;
    }
  }
`;

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
    <Box borderBottomWidth="1px" borderColor={colors.border} itemScope itemType="https://schema.org/Question">
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
          itemProp="name"
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
        itemScope
        itemType="https://schema.org/Answer"
        itemProp="acceptedAnswer"
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
          itemProp="text"
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
  // Honeypot — must remain empty.
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setStatus('submitting');
    setErrorText(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          message: message.trim(),
          [HONEYPOT_FIELD]: companyWebsite,
        }),
      });
      if (res.ok) {
        trackContactSubmit({ email: email.trim(), phone: phone.trim() || undefined });
        setStatus('success');
        setName(''); setEmail(''); setPhone(''); setMessage('');
      } else {
        let friendly = 'Something went wrong. Please try again.';
        try {
          const data = await res.json();
          if (res.status === 429) {
            friendly = typeof data?.error === 'string'
              ? data.error
              : 'Too many attempts. Please try again shortly.';
          } else if (data?.code === 'SUSPICIOUS_SUBMISSION') {
            friendly = 'We could not process this request. Please try again.';
          } else if (typeof data?.error === 'string') {
            friendly = data.error;
          }
        } catch {
          // ignore
        }
        setErrorText(friendly);
        setStatus('error');
      }
    } catch {
      setErrorText('Something went wrong. Please try again.');
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
            CONTACT US
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
              {/* Honeypot: visually hidden, off the tab order, not labelled for users. */}
              <Box
                aria-hidden="true"
                position="absolute"
                left="-10000px"
                top="auto"
                width="1px"
                height="1px"
                overflow="hidden"
                pointerEvents="none"
              >
                <Input
                  type="text"
                  name="companyWebsite"
                  tabIndex={-1}
                  autoComplete="off"
                  value={companyWebsite}
                  onChange={(e) => setCompanyWebsite(e.target.value)}
                />
              </Box>
              {status === 'error' && (
                <Text color="#EF4444" fontSize="sm" mt={2} role="alert">{errorText ?? 'Something went wrong. Please try again.'}</Text>
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

function PhoneIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.94.35 1.86.7 2.75a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.33-1.27a2 2 0 0 1 2.11-.45c.89.35 1.81.57 2.75.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function BookingIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <path d="M3.5 9.5h17" />
      <path d="M6 4h12a2.5 2.5 0 0 1 2.5 2.5v12A2.5 2.5 0 0 1 18 21H6a2.5 2.5 0 0 1-2.5-2.5v-12A2.5 2.5 0 0 1 6 4z" />
      <path d="m8 15 2.2 2.2L16.5 11" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 16);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <Box position="fixed" top={0} left={0} right={0} zIndex={80} pointerEvents="none">
      <Box
        as="header"
        h={{ base: '66px', md: '76px' }}
        display="flex"
        alignItems="center"
        bg={scrolled || menuOpen ? 'rgba(9,9,11,0.94)' : 'rgba(9,9,11,0.18)'}
        borderBottomWidth="1px"
        borderColor={scrolled || menuOpen ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)'}
        transition="background 0.28s ease, border-color 0.28s ease, box-shadow 0.28s ease"
        boxShadow={scrolled || menuOpen ? '0 16px 40px rgba(0,0,0,0.28)' : 'none'}
        style={{
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
        pointerEvents="auto"
      >
        <Container maxW="7xl">
          <Flex align="center" justify="space-between" gap={4}>
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link href="/" aria-label="Tyre Rescue home">
                <Image
                  src="/logo.svg"
                  alt="Tyre Rescue"
                  h={{ base: '44px', md: '52px' }}
                  w="auto"
                  display="block"
                />
              </Link>
            </motion.div>

            <Button
              type="button"
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              gap="9px"
              h="42px"
              px={{ base: 3, md: 4 }}
              borderRadius="999px"
              borderWidth="1px"
              borderColor="rgba(255,255,255,0.14)"
              bg="rgba(15,15,18,0.56)"
              color={colors.textPrimary}
              fontSize="12px"
              fontWeight="800"
              letterSpacing="0.08em"
              cursor="pointer"
              transition="all 0.2s ease"
              _hover={{ borderColor: 'rgba(249,115,22,0.55)', color: colors.accent }}
              _active={{ transform: 'scale(0.97)' }}
              aria-expanded={menuOpen}
              aria-controls="home-conversion-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((open) => !open)}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
              Menu
            </Button>
          </Flex>
        </Container>
      </Box>

      {menuOpen && (
        <Box
          id="home-conversion-menu"
          position="fixed"
          top={{ base: '78px', md: '88px' }}
          left={{ base: 3, md: 'auto' }}
          right={{ base: 3, md: 6 }}
          w={{ base: 'auto', md: '360px' }}
          p={3}
          bg="rgba(9,9,11,0.96)"
          borderWidth="1px"
          borderColor="rgba(255,255,255,0.12)"
          borderRadius="18px"
          boxShadow="0 28px 80px rgba(0,0,0,0.48)"
          style={{
            backdropFilter: 'blur(22px)',
            WebkitBackdropFilter: 'blur(22px)',
          }}
          pointerEvents="auto"
        >
          <Flex direction="column" gap={1}>
            {heroMenuItems.map((item, index) => (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: index * 0.035 }}
              >
                <ChakraLink
                  asChild
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  px={4}
                  py={3}
                  borderRadius="12px"
                  color={colors.textPrimary}
                  fontSize="15px"
                  fontWeight="800"
                  textDecoration="none"
                  _hover={{ bg: 'rgba(249,115,22,0.12)', color: colors.accent, textDecoration: 'none' }}
                  onClick={() => setMenuOpen(false)}
                >
                  <Link href={item.href}>
                    {item.label}
                    <Text as="span" color={colors.accent} aria-hidden="true">→</Text>
                  </Link>
                </ChakraLink>
              </motion.div>
            ))}
          </Flex>
        </Box>
      )}
    </Box>
  );
}

function ProgressiveCallBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const heroCallCard = document.getElementById('home-hero-call-card');
    if (!heroCallCard) return;

    const update = () => {
      const headerOffset = window.innerWidth < 768 ? 78 : 88;
      const rect = heroCallCard.getBoundingClientRect();
      setVisible(window.scrollY > 80 && rect.bottom <= headerOffset);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  if (!visible) return null;

  return (
    <Box
      position="fixed"
      top={{ base: '78px', md: '88px' }}
      left={0}
      right={0}
      zIndex={70}
      display="flex"
      justifyContent="center"
      pointerEvents="none"
      px={4}
    >
      <motion.div
        initial={{ opacity: 0, y: -14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: 'min(78vw, 420px)', minWidth: '260px', pointerEvents: 'auto' }}
      >
        <ChakraLink
          className="tr-call-attention-card"
          href={PHONE_HREF}
          onClick={() => trackCallClick('home_progressive_call_bar')}
          display="flex"
          alignItems="center"
          justifyContent="center"
          gap={3}
          minH={{ base: '54px', md: '58px' }}
          px={{ base: 4, md: 5 }}
          borderRadius="18px"
          bg="linear-gradient(135deg, rgba(255,139,36,0.98) 0%, rgba(249,115,22,0.98) 52%, rgba(194,65,12,0.98) 100%)"
          color="#09090B"
          textDecoration="none"
          boxShadow="0 18px 46px rgba(249,115,22,0.34), 0 0 0 1px rgba(255,255,255,0.22) inset"
          _hover={{
            textDecoration: 'none',
            transform: 'translateY(-1px)',
            boxShadow: '0 22px 56px rgba(249,115,22,0.44), 0 0 0 1px rgba(255,255,255,0.28) inset',
          }}
          _active={{ transform: 'scale(0.99)' }}
          transition="transform 0.2s ease, box-shadow 0.2s ease"
          position="relative"
          overflow="hidden"
          aria-label={`Call Tyre Rescue now on ${PHONE_NUMBER}`}
        >
          <Box className="tr-call-attention-sweep" aria-hidden="true" />
          <Box className="tr-call-attention-ring" aria-hidden="true" />
          <Box className="tr-call-attention-icon" position="relative" zIndex={2} display="inline-flex">
            <PhoneIcon size={22} />
          </Box>
          <Box textAlign="left" position="relative" zIndex={2}>
            <Text className="tr-call-attention-text" fontSize={{ base: '18px', md: '21px' }} fontWeight="900" lineHeight="1" style={{ fontFamily: 'var(--font-display)' }}>
              Call Now
            </Text>
            <Text fontSize="11px" fontWeight="800" mt="3px" lineHeight="1">
              Available 24/7
            </Text>
          </Box>
        </ChakraLink>
      </motion.div>
    </Box>
  );
}

function LiveAvailability() {
  const [nightResponse, setNightResponse] = useState(false);

  useEffect(() => {
    const update = () => {
      const hour = new Date().getHours();
      setNightResponse(hour < 6 || hour >= 22);
    };
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay: 0.08 }}
    >
      <Flex
        align="center"
        gap={2}
        w="fit-content"
        maxW="100%"
        px={3}
        py={2}
        borderRadius="999px"
        bg="rgba(9,9,11,0.58)"
        borderWidth="1px"
        borderColor={nightResponse ? 'rgba(249,115,22,0.34)' : 'rgba(34,197,94,0.34)'}
        color={colors.textPrimary}
        boxShadow="0 10px 30px rgba(0,0,0,0.24)"
        style={{
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <Box
          w="9px"
          h="9px"
          borderRadius="full"
          bg={nightResponse ? '#F97316' : '#22C55E'}
          boxShadow={nightResponse ? '0 0 14px rgba(249,115,22,0.72)' : '0 0 14px rgba(34,197,94,0.72)'}
          flexShrink={0}
        />
        <Text fontSize={{ base: '13px', md: '14px' }} fontWeight="800">
          {nightResponse ? 'Night Response Available' : 'Engineers Available Now'}
        </Text>
      </Flex>
    </motion.div>
  );
}

function ConversionHero() {
  return (
    <Box
      as="section"
      position="relative"
      minH={{ base: '100svh', md: '100vh' }}
      overflow="hidden"
      display="flex"
      alignItems="center"
      pt={{ base: '96px', md: '112px' }}
      pb={{ base: '112px', md: '74px' }}
      bg="#09090B"
    >
      <Box
        position="absolute"
        inset={0}
        bgImage={`url(${HERO_BACKGROUND_SRC})`}
        bgSize="cover"
        backgroundPosition={{ base: '60% center', md: 'center center' }}
        transform="scale(1.02)"
        filter="saturate(1.04) contrast(1.08)"
        aria-hidden="true"
      />
      <Box
        position="absolute"
        inset={0}
        bg="linear-gradient(90deg, rgba(5,5,7,0.94) 0%, rgba(5,5,7,0.82) 38%, rgba(5,5,7,0.58) 64%, rgba(5,5,7,0.38) 100%)"
        aria-hidden="true"
      />
      <Box
        position="absolute"
        inset={0}
        bg="radial-gradient(circle at 18% 38%, rgba(249,115,22,0.22) 0%, rgba(249,115,22,0.08) 26%, transparent 54%), linear-gradient(180deg, rgba(9,9,11,0.16) 0%, rgba(9,9,11,0.78) 100%)"
        aria-hidden="true"
      />

      <Container maxW="7xl" position="relative" zIndex={1}>
        <Box maxW={{ base: '100%', md: '760px', lg: '820px' }}>
          <LiveAvailability />

          <Text
            mt={{ base: 5, md: 7 }}
            mb={{ base: 3, md: 4 }}
            color={colors.accent}
            fontSize={{ base: '11px', md: '12px' }}
            fontWeight="900"
            letterSpacing="0.18em"
            textTransform="uppercase"
          >
            Emergency mobile tyre fitting
          </Text>

          <Text
            as="h1"
            color={colors.textPrimary}
            fontSize={{ base: '48px', md: '76px', lg: '92px' }}
            lineHeight={{ base: '0.94', md: '0.9' }}
            fontWeight="900"
            letterSpacing="0"
            maxW="850px"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {heroHeadlineLines.map((line, lineIndex) => (
              <Box key={line.join('-')} as="span" display="block">
                {line.map((word, wordInLineIndex) => {
                  const current = heroHeadlineLines
                    .slice(0, lineIndex)
                    .reduce((count, previousLine) => count + previousLine.length, wordInLineIndex);
                  return (
                    <motion.span
                      key={`${lineIndex}-${word}`}
                      initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      transition={{ duration: 0.58, delay: 0.18 + current * 0.075, ease: [0.16, 1, 0.3, 1] }}
                      style={{
                        display: 'inline-block',
                        marginRight: '0.18em',
                        color: lineIndex === 2 ? colors.accent : undefined,
                      }}
                    >
                      {word}
                    </motion.span>
                  );
                })}
              </Box>
            ))}
          </Text>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.72, ease: [0.16, 1, 0.3, 1] }}
          >
            <Text
              mt={{ base: 4, md: 5 }}
              color="rgba(250,250,250,0.88)"
              fontSize={{ base: '17px', md: '21px' }}
              lineHeight="1.45"
              maxW="640px"
            >
              We come to you at home, work or roadside with emergency mobile fitting across all of Scotland — Glasgow to Shetland.
            </Text>
          </motion.div>

          <Flex as="ul" listStyleType="none" wrap="wrap" gap={{ base: 2, md: 2.5 }} mt={{ base: 5, md: 6 }} maxW="720px">
            {heroTrustChips.map((chip, index) => (
              <motion.li
                key={chip}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.36, delay: 0.82 + index * 0.045 }}
                style={{ listStyle: 'none' }}
              >
                <Flex
                  align="center"
                  minH="34px"
                  px={{ base: 3, md: 3.5 }}
                  borderRadius="999px"
                  bg={chip.includes('★') ? 'rgba(250,204,21,0.13)' : 'rgba(255,255,255,0.08)'}
                  borderWidth="1px"
                  borderColor={chip.includes('★') ? 'rgba(250,204,21,0.28)' : 'rgba(255,255,255,0.13)'}
                  color={chip.includes('★') ? '#FACC15' : 'rgba(250,250,250,0.88)'}
                  fontSize={{ base: '12px', md: '13px' }}
                  fontWeight="800"
                  whiteSpace="nowrap"
                  boxShadow="0 8px 28px rgba(0,0,0,0.18)"
                  style={{
                    backdropFilter: 'blur(14px)',
                    WebkitBackdropFilter: 'blur(14px)',
                  }}
                >
                  {chip}
                </Flex>
              </motion.li>
            ))}
          </Flex>

          <Box mt={{ base: 6, md: 8 }} maxW="610px">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{
                opacity: 1,
                scale: [1, 1.012, 1],
                y: 0,
              }}
              transition={{
                opacity: { duration: 0.35, delay: 1.05 },
                y: { duration: 0.35, delay: 1.05 },
                scale: { duration: 3.8, repeat: Infinity, repeatDelay: 1.7, ease: 'easeInOut' },
              }}
              whileHover={{ scale: 1.018 }}
              whileTap={{ scale: 0.985 }}
            >
              <ChakraLink
                className="tr-call-attention-card"
                id="home-hero-call-card"
                href={PHONE_HREF}
                onClick={() => trackCallClick('home_hero_primary_card')}
                display="flex"
                alignItems="center"
                gap={{ base: 4, md: 5 }}
                minH={{ base: '108px', md: '124px' }}
                p={{ base: 5, md: 6 }}
                borderRadius="22px"
                color="#09090B"
                textDecoration="none"
                bg="linear-gradient(135deg, #FFB15D 0%, #F97316 44%, #B83B0A 100%)"
                boxShadow="0 26px 68px rgba(249,115,22,0.42), 0 0 0 1px rgba(255,255,255,0.24) inset"
                position="relative"
                overflow="hidden"
                _hover={{ textDecoration: 'none' }}
                aria-label={`Call Tyre Rescue now on ${PHONE_NUMBER}`}
              >
                <Box position="absolute" inset={0} bg="linear-gradient(120deg, rgba(255,255,255,0.28) 0%, transparent 26%, transparent 72%, rgba(255,255,255,0.12) 100%)" aria-hidden="true" />
                <Box className="tr-call-attention-sweep" aria-hidden="true" />
                <Box className="tr-call-attention-ring" aria-hidden="true" />
                <Flex
                  className="tr-call-attention-icon"
                  w={{ base: '56px', md: '68px' }}
                  h={{ base: '56px', md: '68px' }}
                  align="center"
                  justify="center"
                  borderRadius="18px"
                  bg="rgba(9,9,11,0.14)"
                  color="#09090B"
                  borderWidth="1px"
                  borderColor="rgba(255,255,255,0.28)"
                  flexShrink={0}
                  position="relative"
                  zIndex={2}
                >
                  <PhoneIcon size={30} />
                </Flex>
                <Box position="relative" zIndex={2} minW={0}>
                  <Text className="tr-call-attention-text" fontSize={{ base: '34px', md: '44px' }} fontWeight="900" lineHeight="0.92" style={{ fontFamily: 'var(--font-display)' }}>
                    Call Now
                  </Text>
                  <Text fontSize={{ base: '14px', md: '16px' }} fontWeight="900" mt={2}>
                    Available 24/7
                  </Text>
                  <Text fontSize={{ base: '12px', md: '13px' }} fontWeight="800" opacity={0.82} mt={1}>
                    Average answer under 15 seconds
                  </Text>
                </Box>
              </ChakraLink>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.34, delay: 1.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <ChakraLink
                asChild
                className="tr-book-attention-card"
                mt={3}
                minH={{ base: '70px', md: '76px' }}
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                gap={{ base: 3, md: 4 }}
                px={{ base: 4, md: 5 }}
                py={{ base: 3, md: 4 }}
                borderRadius="18px"
                bg="linear-gradient(135deg, rgba(9,9,11,0.88) 0%, rgba(24,24,27,0.9) 48%, rgba(67,28,11,0.9) 100%)"
                color={colors.textPrimary}
                borderWidth="1px"
                borderColor="rgba(249,115,22,0.62)"
                textDecoration="none"
                boxShadow="0 16px 42px rgba(0,0,0,0.34), 0 0 0 1px rgba(249,115,22,0.48) inset"
                position="relative"
                overflow="hidden"
                _hover={{
                  bg: 'linear-gradient(135deg, rgba(18,18,20,0.92) 0%, rgba(38,24,14,0.94) 48%, rgba(92,37,9,0.94) 100%)',
                  color: colors.textPrimary,
                  textDecoration: 'none',
                }}
                _active={{ transform: 'scale(0.99)' }}
                transition="background 0.2s ease, color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease"
                aria-label="Book a tyre fitting online"
              >
                <Link href="/book">
                  <Box className="tr-book-attention-sweep" aria-hidden="true" />
                  <Box className="tr-book-attention-ring" aria-hidden="true" />
                  <Flex
                    className="tr-book-attention-icon"
                    w={{ base: '44px', md: '50px' }}
                    h={{ base: '44px', md: '50px' }}
                    align="center"
                    justify="center"
                    borderRadius="15px"
                    bg="rgba(249,115,22,0.18)"
                    color={colors.accent}
                    borderWidth="1px"
                    borderColor="rgba(249,115,22,0.38)"
                    flexShrink={0}
                    position="relative"
                    zIndex={2}
                  >
                    <BookingIcon size={24} />
                  </Flex>
                  <Box position="relative" zIndex={2} flex="1" minW={0}>
                    <Text className="tr-book-attention-text" fontSize={{ base: '22px', md: '26px' }} fontWeight="900" lineHeight="1" style={{ fontFamily: 'var(--font-display)' }}>
                      Book Online
                    </Text>
                    <Text fontSize={{ base: '12px', md: '13px' }} fontWeight="800" color={colors.textSecondary} mt={1}>
                      Get a quote and reserve your slot
                    </Text>
                  </Box>
                  <Text className="tr-book-attention-arrow" as="span" color={colors.accent} fontSize={{ base: '24px', md: '28px' }} fontWeight="900" position="relative" zIndex={2} aria-hidden="true">
                    →
                  </Text>
                </Link>
              </ChakraLink>
            </motion.div>
          </Box>
        </Box>
      </Container>

      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.38, repeat: Infinity, repeatType: 'reverse', repeatDelay: 0.8 }}
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 22,
          zIndex: 2,
          transform: 'translateX(-50%)',
        }}
        aria-hidden="true"
      >
        <Box w="28px" h="44px" borderRadius="999px" borderWidth="1px" borderColor="rgba(255,255,255,0.32)" display={{ base: 'none', md: 'flex' }} alignItems="flex-start" justifyContent="center" p="7px">
          <Box w="4px" h="8px" borderRadius="999px" bg={colors.accent} />
        </Box>
      </motion.div>
    </Box>
  );
}

// ─── Main Component ──────────────────────────────────────
export function HomePage() {
  const [timelineVisible, setTimelineVisible] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

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
      <LandingHeader />
      <ProgressiveCallBar />

      <Box as="main" id="main-content" flex={1}>
        {/* ═══════════════════════════════════════════════════
            SECTION 1: CONVERSION HERO
        ═══════════════════════════════════════════════════ */}
        <ConversionHero />

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
            SECTION: TRUSTED TRANSPORT PARTNERS
        ═══════════════════════════════════════════════════ */}
        <Box
          as="section"
          id="partners"
          aria-labelledby="partners-heading"
          bg={colors.bg}
          py={{ base: '60px', md: '80px' }}
          px={{ base: 4, md: 8 }}
        >
          <Container maxW="1200px">
            <AnimatedSection>
              <Box textAlign="center" mb={{ base: 10, md: 12 }}>
                <Text
                  fontSize="11px"
                  color={colors.accent}
                  letterSpacing="0.2em"
                  mb={3}
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  OUR NETWORK
                </Text>
                <Text
                  as="h2"
                  id="partners-heading"
                  fontSize={{ base: '32px', md: '48px' }}
                  color={colors.textPrimary}
                  lineHeight="1.1"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Trusted Transport Partners
                </Text>
                <Box h="2px" w="60px" bg={colors.accent} mt={4} mx="auto" />
                <Text
                  fontSize="14px"
                  color={colors.textSecondary}
                  maxW="600px"
                  mx="auto"
                  mt={4}
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  We work with trusted logistics partners to ensure your tyres arrive quickly and reliably.
                </Text>
              </Box>

              <SimpleGrid columns={{ base: 1, md: 3 }} gap={{ base: 6, md: 8 }}>
                {partnerCompanies.map((partner) => (
                  <Box
                    key={partner.name}
                    bg={colors.card}
                    borderWidth="1px"
                    borderColor={colors.border}
                    p={{ base: 6, md: 8 }}
                    position="relative"
                    transition="all 0.3s"
                    _hover={{
                      borderColor: 'rgba(249,115,22,0.35)',
                      transform: 'translateY(-4px)',
                    }}
                    style={{
                      clipPath: 'polygon(0 0, 100% 0, 100% 92%, 92% 100%, 0 100%)',
                    }}
                  >
                    <Text
                      as="h3"
                      fontSize={{ base: '20px', md: '24px' }}
                      color={colors.textPrimary}
                      mb={3}
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {partner.name}
                    </Text>

                    <Flex gap={2} flexWrap="wrap" mb={4}>
                      {partner.badges.map((badge) => (
                        <Box
                          key={badge}
                          bg={colors.surface}
                          px={3}
                          py={1}
                          borderWidth="1px"
                          borderColor={colors.border}
                        >
                          <Text
                            fontSize="10px"
                            color={colors.accent}
                            letterSpacing="0.1em"
                            style={{ fontFamily: 'var(--font-body)' }}
                          >
                            {badge.toUpperCase()}
                          </Text>
                        </Box>
                      ))}
                    </Flex>

                    <Text
                      fontSize="13px"
                      color={colors.textSecondary}
                      lineHeight="1.6"
                      mb={4}
                      style={{ fontFamily: 'var(--font-body)' }}
                    >
                      {partner.description}
                    </Text>

                    <ChakraLink
                      href={partner.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      display="inline-flex"
                      alignItems="center"
                      gap={2}
                      fontSize="12px"
                      color={colors.accent}
                      letterSpacing="0.1em"
                      _hover={{ color: colors.textPrimary }}
                      transition="color 0.2s"
                      style={{ fontFamily: 'var(--font-body)' }}
                    >
                      VISIT WEBSITE →
                    </ChakraLink>
                  </Box>
                ))}
              </SimpleGrid>

              <Text
                fontSize="11px"
                color={colors.textSecondary}
                textAlign="center"
                mt={8}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                Partner listings are for reference only and do not imply endorsement. Services are provided independently.
              </Text>
            </AnimatedSection>
          </Container>
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
                    Complete Mobile Tyre Service
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
            <AnimatedSection>
              <Text
                fontSize="13px"
                color={colors.textSecondary}
                lineHeight="1.6"
                mt={6}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                * {PRICING_DISCLAIMER}{' '}
                <Link
                  href={PRICING_DISCLAIMER_HREF}
                  style={{ color: colors.accent, textDecoration: 'underline' }}
                >
                  See full pricing FAQ
                </Link>
                .
              </Text>
            </AnimatedSection>
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
                  WE STAND BEHIND EVERY JOB.
                </Text>
                <Text fontSize="15px" color={colors.textSecondary} lineHeight="1.7" style={{ fontFamily: 'var(--font-body)' }}>
                  If you are not completely satisfied with our work, we will return and put it right at no extra charge. No arguments, no hassle.
                </Text>
                <Box mt={4}>
                  <Text fontSize="13px" color={colors.textSecondary} style={{ fontFamily: 'var(--font-body)' }}>
                    Call us anytime:{' '}
                    <ChakraLink href="tel:01412660690" color={colors.accent} _hover={{ opacity: 0.8 }} onClick={() => trackCallClick('home_guarantee')}>0141 266 0690</ChakraLink>
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
              AREAS WE COVER
            </Text>
            <Box h="2px" w="60px" bg={colors.accent} mb={4} />
            <Text fontSize="15px" color={colors.textSecondary} mb={6} style={{ fontFamily: 'var(--font-body)' }}>
              We operate across all of Scotland — from Glasgow to Shetland. Select your city or{' '}
              <Link href="/service-areas" style={{ color: '#F97316', textDecoration: 'underline' }}>view full coverage map</Link>.
            </Text>
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

            <Box mb={{ base: 8, md: 10 }}>
              <TrustpilotReviewCollector />
            </Box>

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
                  DUKE STREET TYRES.
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
                  { title: 'Established 2014', sub: 'Over a decade serving Scotland' },
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
            SECTION: AI-OPTIMIZED CONTENT
        ═══════════════════════════════════════════════════ */}
        <Box bg={colors.bg} py={{ base: '60px', md: '100px' }} px={{ base: 4, md: 8 }}>
          <Container maxW="4xl">
            <AIOptimizedSection
              question="What is Mobile Tyre Fitting and How Does It Work?"
              directAnswer="Mobile tyre fitting is when a certified technician comes to your location — home, work, or roadside — with all equipment needed to fit new tyres or repair punctures. Tyre Rescue covers all of Scotland: Glasgow and Edinburgh typically within 45 minutes, Aberdeen and Inverness within 90 minutes, with the Highlands and Islands served by advance booking. Fitting is completed on-site in 30–45 minutes and you pay only when the job is done."
              entityType="process"
              detailedAnswer={
                <Flex direction="column" gap="30px">
                  <Box>
                    <Text as="h3" fontSize={{ base: '20px', md: '24px' }} fontWeight="700" color={colors.textPrimary} mb="16px" style={{ fontFamily: 'var(--font-body)' }}>
                      The 4-Step Mobile Tyre Fitting Process
                    </Text>
                    <SimpleGrid columns={{ base: 1, md: 2 }} gap="16px">
                      {[
                        { step: '1. Book Online or Call', text: 'Book in under 3 minutes via our website or call 0141 266 0690. Select your tyre size, location, and preferred time — or request an emergency callout.' },
                        { step: '2. Fitter Dispatched', text: 'A certified mobile fitter is assigned with the correct tyres already in stock. You receive live tracking and ETA via email.' },
                        { step: '3. Professional Fitting On-Site', text: 'The fitter arrives with professional equipment: hydraulic jack, torque wrench, balancing machine. Fitting takes 30–45 minutes per tyre.' },
                        { step: '4. Payment & Warranty', text: 'Pay by card when the job is complete. All tyres come with manufacturer warranty and our satisfaction guarantee.' },
                      ].map((item) => (
                        <Box key={item.step} bg={colors.surface} p="24px" borderRadius="8px" border="1px solid" borderColor={colors.border}>
                          <Text fontWeight="700" fontSize="16px" mb="10px" color={colors.accent} style={{ fontFamily: 'var(--font-body)' }}>{item.step}</Text>
                          <Text fontSize="15px" color={colors.textSecondary} lineHeight="1.7" style={{ fontFamily: 'var(--font-body)' }}>{item.text}</Text>
                        </Box>
                      ))}
                    </SimpleGrid>
                  </Box>
                  <Box>
                    <Text as="h3" fontSize={{ base: '20px', md: '24px' }} fontWeight="700" color={colors.textPrimary} mb="16px" style={{ fontFamily: 'var(--font-body)' }}>
                      What&apos;s Included in Mobile Tyre Fitting
                    </Text>
                    <Flex direction="column" gap="10px" pl="20px">
                      {[
                        'Professional tyre removal and fitting',
                        'Wheel balancing (essential for smooth driving)',
                        'Valve replacement (new rubber valve with each tyre)',
                        'Torque setting to manufacturer specifications',
                        'Safety check and tyre pressure adjustment',
                        'Old tyre disposal (environmentally compliant)',
                      ].map((item) => (
                        <Text key={item} fontSize="15px" color={colors.textSecondary} lineHeight="1.7" style={{ fontFamily: 'var(--font-body)' }}>
                          • {item}
                        </Text>
                      ))}
                    </Flex>
                  </Box>
                </Flex>
              }
              relatedQuestions={[
                'How much does mobile tyre fitting cost in Glasgow?',
                'Can you fit tyres at night or on weekends?',
                'Do mobile fitters have all tyre sizes in stock?',
                'Is mobile tyre fitting more expensive than a garage?',
              ]}
            />

            <AIOptimizedSection
              question="How Much Does Mobile Tyre Fitting Cost?"
              directAnswer="Mobile tyre fitting in Glasgow typically costs £60–£170 per tyre, which includes a £20 fitting fee plus the tyre price. Budget tyres start from £40, mid-range from £60, and premium brands from £100. Emergency callouts add a £49 surcharge. There are no hidden charges — your fitter confirms the full price before starting work."
              entityType="pricing"
              detailedAnswer={
                <Flex direction="column" gap="30px">
                  <Box overflowX="auto">
                    <Text as="h3" fontSize={{ base: '20px', md: '24px' }} fontWeight="700" color={colors.textPrimary} mb="16px" style={{ fontFamily: 'var(--font-body)' }}>
                      Pricing Breakdown by Tyre Type
                    </Text>
                    <Box as="table" width="100%" css={{ borderCollapse: 'collapse' }}>
                      <Box as="thead">
                        <Box as="tr">
                          {['Tyre Type', 'Tyre Price', 'Fitting Fee', 'Total'].map((h) => (
                            <Box key={h} as="th" bg={colors.surface} color={colors.textPrimary} fontWeight="600" fontSize="13px" textTransform="uppercase" letterSpacing="0.05em" p="12px" borderBottom="1px solid" borderColor={colors.border} textAlign="left">
                              {h}
                            </Box>
                          ))}
                        </Box>
                      </Box>
                      <Box as="tbody">
                        {[
                          ['Budget', '£40–£60', '£20', '£60–£80'],
                          ['Mid-range', '£60–£100', '£20', '£80–£120'],
                          ['Premium', '£100–£150', '£20', '£120–£170'],
                        ].map((row) => (
                          <Box as="tr" key={row[0]}>
                            {row.map((cell, ci) => (
                              <Box key={ci} as="td" color={colors.textSecondary} fontSize="14px" p="12px" borderBottom="1px solid" borderColor={colors.border}>
                                {cell}
                              </Box>
                            ))}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </Box>
                  <Box>
                    <Text as="h3" fontSize={{ base: '20px', md: '24px' }} fontWeight="700" color={colors.textPrimary} mb="16px" style={{ fontFamily: 'var(--font-body)' }}>
                      What Affects the Price?
                    </Text>
                    <Flex direction="column" gap="10px" pl="20px">
                      {[
                        'Tyre size — larger wheels (17"+) cost more',
                        'Brand — Michelin/Continental cost more than budget alternatives',
                        'Emergency vs scheduled — emergency callouts add a £49 surcharge',
                        'Number of tyres — fitting 4 tyres is cheaper per-unit than fitting 1',
                        'Run-flat tyres — typically 20–30% more than standard tyres',
                      ].map((item) => (
                        <Text key={item} fontSize="15px" color={colors.textSecondary} lineHeight="1.7" style={{ fontFamily: 'var(--font-body)' }}>
                          • {item}
                        </Text>
                      ))}
                    </Flex>
                  </Box>
                </Flex>
              }
              relatedQuestions={[
                'Do you offer free quotes before fitting?',
                'Are there any hidden charges?',
                'Is it cheaper to go to a garage instead?',
                'Do you offer payment plans?',
              ]}
            />
          </Container>
        </Box>

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
              onClick={() => trackCallClick('home_bottom_cta_phone')}
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
                onClick={() => trackCallClick('home_bottom_cta_button')}
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

      <Footer />
    </Box>
  );
}
