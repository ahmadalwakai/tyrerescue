'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  Box,
  Container,
  Flex,
  HStack,
  Heading,
  SimpleGrid,
  Stack,
  Text,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { CUSTOMER_BRANDS } from '@/lib/config/site';

const brand = CUSTOMER_BRANDS.duke_street_tyres;

const DUKE = {
  dark: '#0B0F14',
  darkAlt: '#11161D',
  red: '#E11D2E',
  redDark: '#A30D19',
  green: '#25D366',
  greenDark: '#1DA851',
  gold: '#E11D2E',
  muted: '#9BA3AF',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  white: '#F5F7FA',
};

const PHONE_E164 = '+441412660690';
const RESPONSE_TIME = '30-40 mins';
const ADDRESS = '3, 10 Gateside St, Glasgow G31 1PD';
const GOOGLE_REVIEW_COUNT = 154;
const GOOGLE_REVIEWS_URL =
  'https://maps.app.goo.gl/sqZLL3ArLuSmnsJj7?g_st=ic';
const MAP_TILES = [
  [
    'https://tile.openstreetmap.org/16/32000/20452.png',
    'https://tile.openstreetmap.org/16/32001/20452.png',
    'https://tile.openstreetmap.org/16/32002/20452.png',
  ],
  [
    'https://tile.openstreetmap.org/16/32000/20453.png',
    'https://tile.openstreetmap.org/16/32001/20453.png',
    'https://tile.openstreetmap.org/16/32002/20453.png',
  ],
  [
    'https://tile.openstreetmap.org/16/32000/20454.png',
    'https://tile.openstreetmap.org/16/32001/20454.png',
    'https://tile.openstreetmap.org/16/32002/20454.png',
  ],
] as const;

const NAV_LINKS = [
  { label: 'Scotland Coverage', href: '#coverage' },
  { label: 'Glasgow', href: '#coverage' },
  { label: 'Edinburgh', href: '#coverage' },
  { label: 'Dundee', href: '#coverage' },
  { label: 'Roadside Help', href: '/book?service=emergency' },
] as const;

const TRUST_CHIPS = [
  { icon: '⚡', title: '30-40 min response' },
  { icon: '🛡️', title: 'Fully insured' },
  { icon: '🛞', title: 'All major brands' },
  { icon: '💳', title: 'Card + Apple Pay' },
] as const;

const TYRE_BRAND_WORDMARKS = [
  'MICHELIN',
  'PIRELLI',
  'CONTINENTAL',
  'BRIDGESTONE',
  'GOODYEAR',
  'DUNLOP',
  'AVON',
  'HANKOOK',
] as const;

const PAYMENTS = ['VISA', 'MASTERCARD', 'AMEX', 'APPLE PAY', 'GOOGLE PAY'] as const;

const PRICE_TIERS = [
  {
    label: 'Budget',
    from: '£55',
    body: 'Quality-checked budget brand, fitted, balanced and old tyre disposal included.',
    accent: DUKE.muted,
    featured: false,
  },
  {
    label: 'Mid-range',
    from: '£75',
    body: 'Trusted everyday tyres for cars and vans. The most popular choice for fast call-outs.',
    accent: DUKE.gold,
    featured: true,
  },
  {
    label: 'Premium',
    from: '£95',
    body: 'Michelin, Continental, Goodyear and Pirelli options for performance and comfort.',
    accent: DUKE.muted,
    featured: false,
  },
] as const;

const STEPS = [
  {
    n: '01',
    title: 'Book online or call',
    body: 'Start the live booking flow with your reg, postcode and tyre size. We confirm price and ETA before dispatch.',
  },
  {
    n: '02',
    title: 'We roll to you',
    body: 'A fully kitted mobile fitting van heads to your kerb, car park, driveway or safe roadside location.',
  },
  {
    n: '03',
    title: 'Fitted, balanced, gone',
    body: 'Tyre fitted, balanced and torque-checked. Pay securely and track the job through the shared platform.',
  },
] as const;

const REASONS = [
  {
    icon: '⏱️',
    title: '30-40 min average response',
    body: 'Real on-scene times across Glasgow, Edinburgh and Dundee, with live dispatch visibility.',
  },
  {
    icon: '🌙',
    title: 'Truly 24/7',
    body: 'Emergency mobile tyre support day, night, weekends and bank holidays.',
  },
  {
    icon: '🚐',
    title: 'Fully-stocked vans',
    body: 'Budget, mid-range and premium options for cars, vans, SUVs and run-flats.',
  },
  {
    icon: '🛡️',
    title: 'Fully insured',
    body: 'Every fit is balanced on calibrated equipment and torqued to manufacturer spec.',
  },
  {
    icon: '💳',
    title: 'Card and Apple Pay',
    body: 'Secure payment options at the kerb, with digital confirmation for your booking.',
  },
  {
    icon: '⭐',
    title: '5-star Google reputation',
    body: 'Drivers across Scotland trust the Duke Street Tyres team for urgent tyre help.',
  },
] as const;

const COVERAGE = [
  {
    city: 'GLASGOW',
    body: 'Covering G1-G81 including Duke Street, Dennistoun, Bridgeton, Parkhead, Merchant City and Glasgow Green.',
  },
  {
    city: 'EDINBURGH',
    body: 'Covering EH1-EH17 including Leith, Newington, Morningside, Corstorphine, Portobello and the city bypass.',
  },
  {
    city: 'DUNDEE',
    body: 'Covering DD1-DD11 including the waterfront, Broughty Ferry, Lochee, Ninewells and the Kingsway.',
  },
] as const;

const TYRE_BRANDS = [
  'Michelin',
  'Pirelli',
  'Dunlop',
  'Continental',
  'Bridgestone',
  'Goodyear',
  'Uniroyal',
  'Yokohama',
  'Hankook',
  'Firestone',
  'Kumho Tyre',
] as const;

const FAQS = [
  {
    question: 'How fast can you actually get to me?',
    answer:
      'Average on-scene time across Glasgow, Edinburgh and Dundee is 30 to 40 minutes from the moment you call. We confirm an exact ETA before dispatch.',
  },
  {
    question: 'Which areas do you cover?',
    answer:
      'Core coverage includes Glasgow G postcodes, Edinburgh EH postcodes and Dundee DD postcodes, plus nearby central Scotland routes when fitter position and stock allow.',
  },
  {
    question: 'How can I pay at the roadside?',
    answer:
      'Card, contactless and Apple Pay are accepted. Online bookings use the same secure payment flow as Tyre Rescue.',
  },
  {
    question: 'What tyre brands do you carry?',
    answer:
      'We stock budget, mid-range and premium tyres including Michelin, Continental, Bridgestone, Pirelli, Goodyear and Dunlop, subject to size availability.',
  },
  {
    question: 'Are you open out of hours?',
    answer:
      'Yes. The emergency service operates 24 hours a day, 7 days a week, including weekends and bank holidays.',
  },
  {
    question: 'Can you reach me on the motorway?',
    answer:
      'We can attend safe call-outs around major routes. If you are stopped on a live carriageway, move behind the barrier and follow emergency guidance first.',
  },
] as const;

function telHref() {
  return `tel:${PHONE_E164}`;
}

function waHref(message = 'Hi, I need mobile tyre fitting') {
  return `https://wa.me/${brand.whatsappPhone}?text=${encodeURIComponent(message)}`;
}

function normalizeTyreSize(value: string) {
  const compact = value.trim().toUpperCase().replace(/\s+/g, '');
  const match = compact.match(/^(\d{3})\/(\d{2,3})R?(\d{2})$/);
  if (!match) return compact;
  return `${match[1]}/${match[2]}R${match[3]}`;
}

function PhoneIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.36 2.3.55 3.6.55a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.3.2 2.5.55 3.6a1 1 0 0 1-.25 1l-2.2 2.2Z" />
    </svg>
  );
}

function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" aria-hidden>
      <path d="M27.2 4.7A15.7 15.7 0 0 0 4.4 25.1L2 30l5.1-1.3A15.7 15.7 0 1 0 27.2 4.7ZM16 28.6a13 13 0 0 1-6.6-1.8l-.5-.3-3 .8.8-2.9-.3-.5A12.9 12.9 0 1 1 16 28.6Zm7.5-9.7c-.4-.2-2.4-1.2-2.8-1.3-.4-.1-.7-.2-.9.2-.3.4-1.1 1.3-1.3 1.6-.2.2-.5.3-.9.1a10.4 10.4 0 0 1-3-1.9 11.5 11.5 0 0 1-2.1-2.6c-.2-.4 0-.6.2-.8.2-.2.4-.5.6-.7.2-.2.3-.4.4-.6.1-.3.1-.5 0-.7l-1.2-2.9c-.3-.7-.6-.6-.9-.6h-.7a1.5 1.5 0 0 0-1.1.5 4.5 4.5 0 0 0-1.4 3.3 7.8 7.8 0 0 0 1.6 4.2c.2.3 2.7 4.1 6.5 5.7a22 22 0 0 0 2.2.8 5.3 5.3 0 0 0 2.4.2 4 4 0 0 0 2.6-1.8 3.3 3.3 0 0 0 .2-1.8c-.1-.2-.4-.3-.8-.5Z" />
    </svg>
  );
}

function DukeButton({
  href,
  children,
  tone = 'red',
  fullWidth = false,
  className,
  target,
  rel,
}: {
  href: string;
  children: ReactNode;
  tone?: 'red' | 'green' | 'ghost' | 'gold' | 'white';
  fullWidth?: boolean;
  className?: string;
  target?: string;
  rel?: string;
}) {
  const stylesByTone: Record<typeof tone, CSSProperties> = {
    red: {
      background: DUKE.red,
      borderColor: DUKE.red,
      color: '#FFFFFF',
    },
    green: {
      background: DUKE.green,
      borderColor: DUKE.green,
      color: '#FFFFFF',
    },
    ghost: {
      background: 'transparent',
      borderColor: 'rgba(255,255,255,0.38)',
      color: '#FFFFFF',
    },
    gold: {
      background: DUKE.gold,
      borderColor: DUKE.gold,
      color: '#FFFFFF',
    },
    white: {
      background: '#FFFFFF',
      borderColor: '#FFFFFF',
      color: DUKE.red,
    },
  };

  const style: CSSProperties = {
    ...stylesByTone[tone],
    alignItems: 'center',
    borderRadius: 8,
    borderStyle: 'solid',
    borderWidth: 1,
    display: 'inline-flex',
    flex: fullWidth ? '1 1 0' : undefined,
    fontFamily: 'var(--font-body), system-ui, sans-serif',
    fontSize: 16,
    fontWeight: 800,
    gap: 8,
    justifyContent: 'center',
    letterSpacing: 0,
    minHeight: 52,
    minWidth: fullWidth ? 0 : undefined,
    padding: '0 22px',
    position: 'relative',
    textDecoration: 'none',
    transition: 'transform 0.22s ease, background-color 0.22s ease, box-shadow 0.22s ease',
    whiteSpace: 'nowrap',
    width: fullWidth ? '100%' : undefined,
  };
  const buttonClassName = ['duke-btn', `duke-btn-${tone}`, className].filter(Boolean).join(' ');

  if (href.startsWith('/')) {
    return (
      <Link href={href} className={buttonClassName} style={style}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} target={target} rel={rel} className={buttonClassName} style={style}>
      {children}
    </a>
  );
}

function SectionHeading({
  eyebrow,
  children,
  align = 'center',
}: {
  eyebrow: string;
  children: ReactNode;
  align?: 'left' | 'center';
}) {
  return (
    <Stack gap={3} mb={{ base: 8, md: 10 }} align={align === 'center' ? 'center' : 'flex-start'}>
      <Text color={DUKE.gold} fontWeight={800} fontSize="12px" letterSpacing={0}>
        {eyebrow}
      </Text>
      <Heading
        as="h2"
        fontFamily="var(--font-display), Impact, sans-serif"
        fontSize={{ base: 'clamp(1.75rem, 6.5vw, 2.5rem)', md: 'clamp(2.25rem, 4.5vw, 3.25rem)' }}
        lineHeight="1.1"
        letterSpacing={0}
        textTransform="uppercase"
        color="white"
        textAlign={align}
        maxW="22ch"
      >
        {children}
      </Heading>
    </Stack>
  );
}

function MarqueeStrip() {
  const text = '24/7 EMERGENCY MOBILE TYRE FITTING - GLASGOW - EDINBURGH - DUNDEE';
  const items = Array.from({ length: 6 }, () => `${text}   `).join('');

  return (
    <Box
      bg={DUKE.red}
      color="white"
      fontSize="12px"
      fontWeight={800}
      letterSpacing={0}
      overflow="hidden"
      h="28px"
      display="flex"
      alignItems="center"
    >
      <Box className="duke-marquee" aria-hidden>
        {items + items}
      </Box>
      <Text px={3} display={{ base: 'block', md: 'none' }} whiteSpace="nowrap">
        {text}
      </Text>
    </Box>
  );
}

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box
      as="header"
      position="sticky"
      top={0}
      zIndex={1000}
      bg="rgba(11,15,20,0.78)"
      borderBottom={`1px solid ${DUKE.border}`}
      backdropFilter="saturate(180%) blur(12px)"
    >
      <MarqueeStrip />
      <Container maxW="6xl" py={3}>
        <Flex align="center" justify="space-between" gap={4}>
          <Link href="/" aria-label={`${brand.name} home`} style={{ color: 'white', textDecoration: 'none' }}>
            <HStack gap={2}>
      <Image src="/duke-street-tyres-logo.svg" alt="Duke Street Tyres logo" width={40} height={40} priority />
              <Box lineHeight={1}>
                <Text
                  fontFamily="var(--font-display), Impact, sans-serif"
                  fontSize={{ base: '18px', md: '22px' }}
                  letterSpacing={0}
                >
                  DUKE STREET TYRES
                </Text>
                <Text fontSize="10px" color={DUKE.muted} letterSpacing={0}>
                  24/7 MOBILE FITTING
                </Text>
              </Box>
            </HStack>
          </Link>

          <HStack
            as="nav"
            aria-label="Primary navigation"
            gap={4}
            display={{ base: 'none', lg: 'flex' }}
            fontSize="14px"
            color={DUKE.muted}
          >
            {NAV_LINKS.map((item) => (
              <Link key={item.label} href={item.href} style={{ color: 'inherit', textDecoration: 'none' }}>
                {item.label}
              </Link>
            ))}
          </HStack>

          <HStack gap={2} display={{ base: 'none', md: 'flex' }}>
            <DukeButton href="/book" tone="red" className="duke-btn-book">
              Book online
            </DukeButton>
            <DukeButton href={waHref()} tone="ghost" target="_blank" rel="noopener">
              <WhatsAppIcon size={16} />
              WhatsApp
            </DukeButton>
            <DukeButton href={telHref()} tone="red" className="duke-btn-call">
              <PhoneIcon size={16} />
              {brand.phoneDisplay}
            </DukeButton>
          </HStack>

          <Box
            as="button"
            display={{ base: 'inline-flex', md: 'none' }}
            alignItems="center"
            justifyContent="center"
            w="44px"
            h="44px"
            borderRadius="8px"
            border={`1px solid ${DUKE.borderStrong}`}
            bg="transparent"
            color="white"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </Box>
        </Flex>
      </Container>

      {mobileOpen ? (
        <Box
          display={{ base: 'block', md: 'none' }}
          borderTop={`1px solid ${DUKE.border}`}
          bg={DUKE.darkAlt}
          px={5}
          py={5}
        >
          <Stack gap={3}>
            <DukeButton href={telHref()} tone="red" className="duke-btn-call" fullWidth>
              <PhoneIcon size={18} />
              Call {brand.phoneDisplay}
            </DukeButton>
            <DukeButton href="/book" tone="red" className="duke-btn-book" fullWidth>
              Book online
            </DukeButton>
            <DukeButton href={waHref()} tone="green" fullWidth target="_blank" rel="noopener">
              <WhatsAppIcon size={20} />
              WhatsApp us
            </DukeButton>
            <Stack gap={2} mt={3} color={DUKE.white}>
              {NAV_LINKS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  {item.label}
                </Link>
              ))}
            </Stack>
          </Stack>
        </Box>
      ) : null}
    </Box>
  );
}

function LiveStatusBar() {
  return (
    <HStack
      gap={3}
      px={3}
      py={2}
      bg="rgba(16, 185, 129, 0.12)"
      border="1px solid rgba(16, 185, 129, 0.45)"
      borderRadius="999px"
      width="fit-content"
    >
      <Box position="relative" w="10px" h="10px">
        <Box
          position="absolute"
          inset={0}
          borderRadius="999px"
          bg="#10b981"
          className="duke-live-dot"
        />
      </Box>
      <Text fontSize="12px" fontWeight={800} color="white" letterSpacing={0} textTransform="uppercase">
        Open now
      </Text>
      <Box w="1px" h="12px" bg="rgba(255,255,255,0.28)" />
      <Text fontSize="12px" color={DUKE.muted} fontWeight={600}>
        Fitter on call · 24/7
      </Text>
    </HStack>
  );
}

function HeroReviewBadge() {
  return (
    <Stack
      gap={2}
      bg="rgba(11,15,20,0.78)"
      border={`1px solid ${DUKE.border}`}
      borderRadius="8px"
      px={4}
      py={3}
      backdropFilter="blur(8px)"
      boxShadow="0 18px 40px rgba(0,0,0,0.55)"
      maxW="280px"
    >
      <HStack gap={1} aria-label="5 out of 5 stars">
        {[1, 2, 3, 4, 5].map((value) => (
          <Box key={value} as="span" color={DUKE.gold} fontSize="16px" lineHeight={1} aria-hidden>
            ★
          </Box>
        ))}
        <Text ml={1} fontWeight={800} fontSize="14px" color="white">
          5.0
        </Text>
      </HStack>
      <Text fontSize="12px" color={DUKE.muted} lineHeight={1.4}>
        Rated <strong>5.0 from {GOOGLE_REVIEW_COUNT}</strong> reviews on Google.
      </Text>
    </Stack>
  );
}

function HeroPhotos() {
  const thumbs = [
    {
      src: '/duke-street-tyres-wheel-bmw.webp',
      alt: 'Premium alloy wheel after mobile tyre fitting',
    },
    {
      src: '/duke-street-tyres-puncture.webp',
      alt: 'Tyre puncture repaired or replaced kerbside',
    },
    {
      src: '/duke-street-tyres-wheel-night.webp',
      alt: 'Night-time mobile tyre fitting call-out',
    },
  ];

  return (
    <Stack className="duke-photo-gallery" gap={3} w="100%" maxW="480px">
      <Box
        className="duke-main-photo"
        position="relative"
        w="100%"
        aspectRatio="4 / 3"
        overflow="hidden"
        borderRadius="8px"
        border={`1px solid ${DUKE.border}`}
      >
        <Image
          className="duke-photo-image"
          src="/duke-street-tyres-van.webp"
          alt="Duke Street Tyres mobile fitting van"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 480px"
          style={{ objectFit: 'cover', objectPosition: 'center 54%' }}
        />
        <Box className="duke-photo-vignette" />
        <HStack className="duke-photo-badge" gap={2}>
          <Box w="8px" h="8px" borderRadius="999px" bg={DUKE.green} />
          <Text fontSize="12px" fontWeight={900}>
            MOBILE WORKSHOP READY
          </Text>
        </HStack>
      </Box>

      <HStack gap={2} w="100%">
        {thumbs.map((item, index) => (
          <Box
            className="duke-thumb"
            key={item.src}
            position="relative"
            flex={1}
            aspectRatio="1 / 1"
            overflow="hidden"
            borderRadius="8px"
            border={`1px solid ${DUKE.border}`}
            style={{ animationDelay: `${index * 0.12}s` }}
          >
            <Image
              className="duke-photo-image"
              src={item.src}
              alt={item.alt}
              fill
              sizes="(max-width: 768px) 33vw, 160px"
              style={{ objectFit: 'cover' }}
            />
          </Box>
        ))}
      </HStack>
    </Stack>
  );
}

const inputStyle: CSSProperties = {
  background: DUKE.dark,
  border: `1px solid ${DUKE.borderStrong}`,
  borderRadius: 8,
  color: DUKE.white,
  display: 'block',
  fontFamily: 'var(--font-body), system-ui, sans-serif',
  fontSize: 16,
  height: 48,
  outline: 'none',
  padding: '0 14px',
  width: '100%',
};

function QuoteStartForm() {
  const [postcode, setPostcode] = useState('');
  const [size, setSize] = useState('');
  const [phone, setPhone] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();
    params.set('service', 'fitting');

    if (postcode.trim()) params.set('postcode', postcode.trim());
    if (size.trim()) params.set('size', normalizeTyreSize(size));
    if (phone.trim()) params.set('phone', phone.trim());

    window.location.assign(`/book?${params.toString()}`);
  }

  return (
    <Box bg={DUKE.darkAlt} border={`1px solid ${DUKE.border}`} borderRadius="8px" p={{ base: 4, md: 5 }} boxShadow="0 8px 28px rgba(0,0,0,0.35)">
      <form onSubmit={handleSubmit}>
        <Stack gap={3}>
          <Stack gap={1}>
            <Heading
              as="h2"
              fontFamily="var(--font-display), Impact, sans-serif"
              fontSize={{ base: '22px', md: '26px' }}
              letterSpacing={0}
              color="white"
            >
              GET A 60-SECOND QUOTE
            </Heading>
            <Text color={DUKE.muted} fontSize="14px">
              Three quick details. We will start your live booking.
            </Text>
          </Stack>

          <SimpleGrid columns={{ base: 1, md: 3 }} gap={2}>
            <input
              type="text"
              placeholder="Postcode"
              value={postcode}
              onChange={(event) => setPostcode(event.target.value)}
              autoComplete="postal-code"
              required
              aria-label="Postcode"
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="Tyre size"
              value={size}
              onChange={(event) => setSize(event.target.value)}
              aria-label="Tyre size"
              style={inputStyle}
            />
            <input
              type="tel"
              placeholder="Mobile"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              autoComplete="tel"
              aria-label="Mobile number"
              style={inputStyle}
            />
          </SimpleGrid>

          <button
            className="duke-btn duke-btn-red duke-btn-book duke-form-submit"
            type="submit"
            style={{
              background: DUKE.red,
              border: `1px solid ${DUKE.red}`,
              borderRadius: 8,
              color: 'white',
              cursor: 'pointer',
              fontFamily: 'var(--font-body), system-ui, sans-serif',
              fontSize: 16,
              fontWeight: 800,
              minHeight: 52,
              padding: '0 22px',
              width: '100%',
            }}
          >
            Start live booking
          </button>

          <Text fontSize="12px" color={DUKE.muted}>
            This opens the live Duke Street booking wizard; WhatsApp is only for quick messages.
          </Text>
        </Stack>
      </form>
    </Box>
  );
}

function Hero() {
  return (
    <Box
      as="section"
      className="duke-hero-section"
      bg={DUKE.dark}
      position="relative"
      overflow="hidden"
      borderBottom={`1px solid ${DUKE.border}`}
    >
      <Box className="duke-hero-photo-bg" />
      <Box className="duke-hero-texture" />
      <Container maxW="6xl" py={{ base: 10, md: 16 }} px={{ base: 5, md: 6 }} position="relative">
        <Flex direction={{ base: 'column', md: 'row' }} align="center" gap={{ base: 10, md: 8 }}>
          <Stack className="duke-hero-copy" flex={1} gap={6}>
            <LiveStatusBar />
            <HStack gap={2} color={DUKE.gold} fontSize="12px" fontWeight={800} letterSpacing={0}>
              <Box w="8px" h="8px" borderRadius="999px" bg={DUKE.red} />
              <Text>24/7 EMERGENCY · RESPONSE 30-40 MIN</Text>
            </HStack>
            <Heading
              as="h1"
              fontFamily="var(--font-display), Impact, sans-serif"
              fontSize={{ base: 'clamp(2rem, 8vw, 2.75rem)', md: 'clamp(3rem, 5vw, 4.35rem)' }}
              lineHeight="1.1"
              letterSpacing={0}
              textTransform="uppercase"
              maxW={{ base: '12ch', md: '18ch' }}
              color="white"
              className="duke-hero-shimmer"
            >
              MOBILE TYRE FITTING IN GLASGOW, EDINBURGH & DUNDEE
            </Heading>
            <Text fontSize={{ base: '18px', md: '20px' }} lineHeight={1.5} color={DUKE.muted} maxW="60ch">
              24/7 emergency call-out. We come to your kerb, car park, driveway or roadside with the right tyre on the van. Average on-scene time 30-40 minutes.
            </Text>
            <Stack className="duke-hero-actions" direction={{ base: 'column', md: 'row' }} gap={3} w={{ base: '100%', md: 'auto' }}>
              <DukeButton href={telHref()} tone="red" className="duke-btn-call" fullWidth>
                <PhoneIcon size={18} />
                Call {brand.phoneDisplay}
              </DukeButton>
              <DukeButton href="/book" tone="red" className="duke-btn-book" fullWidth>
                Book online
              </DukeButton>
              <DukeButton href={waHref()} tone="green" fullWidth target="_blank" rel="noopener">
                <WhatsAppIcon size={20} />
                WhatsApp
              </DukeButton>
            </Stack>
            <Box display={{ base: 'block', md: 'none' }} w="100%">
              <HeroPhotos />
            </Box>
            <HStack gap={6} color={DUKE.muted} fontSize="14px" wrap="wrap">
              <Text>✓ Fully insured</Text>
              <Text>✓ All major brands</Text>
              <Text>✓ Card & Apple Pay</Text>
            </HStack>
            <QuoteStartForm />
          </Stack>

          <Box flexShrink={0} position="relative" w={{ base: '100%', md: '480px' }} display={{ base: 'none', md: 'block' }}>
            <HeroPhotos />
            <Box
              position="absolute"
              bottom={{ base: '-12px', md: '-16px' }}
              left={{ base: '50%', md: '-32px' }}
              transform={{ base: 'translateX(-50%)', md: 'none' }}
              zIndex={2}
            >
              <HeroReviewBadge />
            </Box>
          </Box>
        </Flex>
      </Container>
    </Box>
  );
}

function TrustRow() {
  return (
    <Box as="section" bg={DUKE.darkAlt} borderTop={`1px solid ${DUKE.border}`} borderBottom={`1px solid ${DUKE.border}`}>
      <Container maxW="6xl" py={{ base: 8, md: 10 }}>
        <Stack gap={6}>
          <Stack gap={2} textAlign="center">
            <Text fontSize="12px" fontWeight={800} letterSpacing={0} color={DUKE.gold}>
              FITTED ON THE SPOT - ALL MAJOR BRANDS
            </Text>
          </Stack>
          <Wrap justify="center" gap={{ base: 4, md: 8 }}>
            {TYRE_BRAND_WORDMARKS.map((name) => (
              <WrapItem key={name}>
                <Text
                  fontFamily="var(--font-display), Impact, sans-serif"
                  letterSpacing={0}
                  fontSize={{ base: '16px', md: '20px' }}
                  color={DUKE.muted}
                >
                  {name}
                </Text>
              </WrapItem>
            ))}
          </Wrap>

          <HStack justify="center" gap={{ base: 3, md: 6 }} wrap="wrap" pt={2} borderTop={`1px solid ${DUKE.border}`}>
            <Text fontSize="12px" color={DUKE.muted} letterSpacing={0}>
              WE ACCEPT
            </Text>
            {PAYMENTS.map((payment) => (
              <Box
                key={payment}
                px={3}
                py={1}
                border={`1px solid ${DUKE.border}`}
                borderRadius="8px"
                fontSize="12px"
                fontWeight={800}
                letterSpacing={0}
                color={DUKE.white}
                bg={DUKE.dark}
              >
                {payment}
              </Box>
            ))}
          </HStack>
        </Stack>
      </Container>
    </Box>
  );
}

function TrustStrip() {
  return (
    <Box as="section" bg={DUKE.darkAlt} py={6} borderBottom={`1px solid ${DUKE.border}`}>
      <Container maxW="6xl">
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
          {TRUST_CHIPS.map((chip) => (
            <Box
              key={chip.title}
              border={`1px solid ${DUKE.border}`}
              bg={DUKE.dark}
              borderRadius="8px"
              px={4}
              py={3}
              textAlign="center"
              fontWeight={800}
              fontSize="14px"
            >
              <Box as="span" mr={2} aria-hidden>
                {chip.icon}
              </Box>
              <Text as="span">{chip.title}</Text>
            </Box>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  );
}

function BigCallBanner() {
  return (
    <Box as="section" py={{ base: 10, md: 12 }} bg={DUKE.dark} borderTop={`1px solid ${DUKE.border}`} borderBottom={`1px solid ${DUKE.border}`}>
      <Container maxW="5xl">
        <Stack
          direction={{ base: 'column', md: 'row' }}
          align="center"
          justify="space-between"
          gap={6}
          textAlign={{ base: 'center', md: 'left' }}
        >
          <Stack gap={1} flex={1}>
            <Text color={DUKE.gold} fontWeight={800} letterSpacing={0} fontSize="11px" textTransform="uppercase">
              Tap to call now
            </Text>
            <a
              href={telHref()}
              style={{
                color: 'white',
                display: 'inline-block',
                fontFamily: 'var(--font-display), Impact, sans-serif',
                fontSize: 'clamp(2.5rem, 11vw, 4.5rem)',
                letterSpacing: 0,
                lineHeight: 1,
                textDecoration: 'none',
              }}
            >
              {brand.phoneDisplay}
            </a>
            <Text color={DUKE.muted} fontSize="14px">
              Real fitter answers · Average response {RESPONSE_TIME}
            </Text>
          </Stack>

          <HStack gap={3} w={{ base: '100%', md: 'auto' }} justify="center">
            <DukeButton href={telHref()} tone="red" className="duke-btn-call">
              <PhoneIcon size={18} />
              Call
            </DukeButton>
            <DukeButton href={waHref()} tone="green" target="_blank" rel="noopener">
              <WhatsAppIcon size={20} />
              WhatsApp
            </DukeButton>
          </HStack>
        </Stack>
      </Container>
    </Box>
  );
}

function CityIntro() {
  return (
    <Box as="section" py={{ base: 14, md: 20 }}>
      <Container maxW="3xl">
        <Text color={DUKE.gold} fontWeight={800} letterSpacing={0} fontSize="12px">
          GLASGOW · G1-G81
        </Text>
        <Heading
          as="h2"
          mt={3}
          fontFamily="var(--font-display), Impact, sans-serif"
          fontSize={{ base: 'clamp(1.75rem, 6.5vw, 2.5rem)', md: 'clamp(2.5rem, 5vw, 4rem)' }}
          lineHeight="1.1"
          letterSpacing={0}
          textTransform="uppercase"
          maxW="22ch"
          color="white"
        >
          Based in Glasgow. Rolling across the central belt.
        </Heading>
        <Text mt={6} color={DUKE.muted} fontSize={{ base: '16px', md: '18px' }} lineHeight={1.7}>
          Stuck with a flat in Glasgow? Duke Street Tyres rolls out a fully-stocked mobile workshop straight to your door, kerbside, car park or office bay. We carry premium, mid-range and budget tyres for cars, vans and 4x4s, with online booking and live tracking now handled by the same dispatch system used by Tyre Rescue.
        </Text>
      </Container>
    </Box>
  );
}

function PricingStrip() {
  return (
    <Box id="pricing" as="section" py={{ base: 12, md: 16 }} bg={DUKE.dark}>
      <Container maxW="6xl">
        <SectionHeading eyebrow="TRANSPARENT PRICING · NO HIDDEN FEES">
          Honest prices. Fitted at your kerb.
        </SectionHeading>
        <Text color={DUKE.muted} fontSize={{ base: '16px', md: '18px' }} textAlign={{ base: 'left', md: 'center' }} maxW="60ch" mx="auto" mt="-4" mb={8}>
          Example fitted price bands from the original Duke Street Tyres interface. Final checkout pricing is calculated by the shared live pricing engine.
        </Text>

        <SimpleGrid columns={{ base: 1, md: 3 }} gap={5}>
          {PRICE_TIERS.map((tier) => (
            <Stack
              key={tier.label}
              gap={3}
              p={6}
              bg={DUKE.darkAlt}
              border={tier.featured ? `2px solid ${DUKE.gold}` : `1px solid ${DUKE.border}`}
              borderRadius="8px"
              position="relative"
              h="100%"
            >
              {tier.featured ? (
                <Box
                  position="absolute"
                  top="-12px"
                  left="50%"
                  transform="translateX(-50%)"
                  bg={DUKE.gold}
                  color="black"
                  fontSize="11px"
                  fontWeight={900}
                  letterSpacing={0}
                  textTransform="uppercase"
                  px={3}
                  py={1}
                  borderRadius="8px"
                >
                  Most popular
                </Box>
              ) : null}
              <Text fontSize="12px" fontWeight={900} letterSpacing={0} textTransform="uppercase" color={tier.accent}>
                {tier.label}
              </Text>
              <Box>
                <Text as="span" fontSize="12px" color={DUKE.muted}>
                  From
                </Text>{' '}
                <Text
                  as="span"
                  fontFamily="var(--font-display), Impact, sans-serif"
                  fontSize={{ base: '48px', md: '60px' }}
                  color="white"
                  lineHeight={1}
                >
                  {tier.from}
                </Text>{' '}
                <Text as="span" color={DUKE.muted} fontSize="14px">
                  fitted
                </Text>
              </Box>
              <Text color={DUKE.muted} fontSize="14px" lineHeight={1.5}>
                {tier.body}
              </Text>
            </Stack>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  );
}

function HowItWorks() {
  return (
    <Box as="section" py={{ base: 16, md: 20 }}>
      <Container maxW="6xl">
        <SectionHeading eyebrow="HOW IT WORKS">One call. On the way.</SectionHeading>
        <SimpleGrid columns={{ base: 1, md: 3 }} gap={6}>
          {STEPS.map((step) => (
            <Box key={step.n} p={6} border={`1px solid ${DUKE.border}`} bg={DUKE.darkAlt} borderRadius="8px" h="100%">
              <Text fontFamily="var(--font-display), Impact, sans-serif" color={DUKE.red} fontSize="40px" letterSpacing={0}>
                {step.n}
              </Text>
              <Heading as="h3" fontSize="20px" mt={2} mb={2} color="white">
                {step.title}
              </Heading>
              <Text color={DUKE.muted} fontSize="14px" lineHeight={1.6}>
                {step.body}
              </Text>
            </Box>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  );
}

function WhyUs() {
  return (
    <Box as="section" py={{ base: 14, md: 20 }} bg={DUKE.darkAlt}>
      <Container maxW="6xl">
        <SectionHeading eyebrow="WHY DRIVERS PICK US">
          Built for emergencies. Priced for everyone.
        </SectionHeading>

        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={5}>
          {REASONS.map((reason) => (
            <Stack key={reason.title} gap={3} p={6} bg={DUKE.dark} border={`1px solid ${DUKE.border}`} borderRadius="8px" h="100%">
              <Box fontSize="24px" aria-hidden>
                {reason.icon}
              </Box>
              <Heading
                as="h3"
                fontFamily="var(--font-display), Impact, sans-serif"
                fontSize="22px"
                letterSpacing={0}
                textTransform="uppercase"
                color="white"
                lineHeight={1.15}
              >
                {reason.title}
              </Heading>
              <Text color={DUKE.muted} fontSize="14px" lineHeight={1.6}>
                {reason.body}
              </Text>
            </Stack>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  );
}

function CoverageSection() {
  return (
    <Box id="coverage" as="section" py={{ base: 16, md: 20 }} bg={DUKE.darkAlt}>
      <Container maxW="6xl">
        <SectionHeading eyebrow="WHERE WE COVER">Glasgow · Edinburgh · Dundee</SectionHeading>

        <SimpleGrid columns={{ base: 1, md: 3 }} gap={6} mb={10}>
          {COVERAGE.map((area) => (
            <Box
              key={area.city}
              p={6}
              border={`1px solid ${DUKE.border}`}
              borderRadius="8px"
              bg={DUKE.dark}
              h="100%"
            >
              <Heading
                as="h3"
                fontFamily="var(--font-display), Impact, sans-serif"
                fontSize="28px"
                letterSpacing={0}
                color="white"
              >
                {area.city}
              </Heading>
              <Text mt={2} fontSize="14px" color={DUKE.muted} lineHeight={1.6}>
                {area.body}
              </Text>
              <Link href="/book" style={{ color: DUKE.gold, display: 'inline-block', fontSize: 14, fontWeight: 800, marginTop: 12, textDecoration: 'none' }}>
                Check availability →
              </Link>
            </Box>
          ))}
        </SimpleGrid>

        <Box mb={10} p={6} border={`1px solid ${DUKE.border}`} borderRadius="8px" bg={DUKE.dark}>
          <Stack gap={3}>
            <Heading as="h3" fontSize="22px" fontFamily="var(--font-display), Impact, sans-serif" letterSpacing={0} color="white">
              WIDER SCOTLAND COVERAGE
            </Heading>
            <Text color={DUKE.muted} fontSize="14px" lineHeight={1.7}>
              Priority nearby areas include Paisley, East Kilbride, Hamilton, Motherwell, Clydebank, Cumbernauld, Livingston, Falkirk, Stirling and Perth. Availability depends on tyre stock, fitter position and safe access.
            </Text>
            <Link href="/book" style={{ color: DUKE.gold, fontSize: 14, fontWeight: 800, textDecoration: 'none' }}>
              Start a Duke Street booking →
            </Link>
          </Stack>
        </Box>

        <Box border={`1px solid ${DUKE.border}`} borderRadius="8px" overflow="hidden" bg="#E8EDF3">
          <Box position="relative" w="100%" aspectRatio="16 / 9" minH={{ base: '360px', md: '520px' }} overflow="hidden">
            <Box
              position="absolute"
              inset="-9% -6%"
              display="grid"
              gridTemplateColumns="repeat(3, 1fr)"
              gridTemplateRows="repeat(3, 1fr)"
              aria-hidden
            >
              {MAP_TILES.flatMap((row) => row).map((src) => (
                <Box key={src} position="relative" minH={0}>
                  <Image
                    src={src}
                    alt=""
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 40vw, 430px"
                    style={{ objectFit: 'cover' }}
                  />
                </Box>
              ))}
            </Box>
            <Box position="absolute" inset={0} bg="linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02))" pointerEvents="none" />
            <Box
              position="absolute"
              top={{ base: 4, md: 5 }}
              left={{ base: 4, md: 5 }}
              maxW={{ base: 'calc(100% - 32px)', sm: '320px' }}
              bg="rgba(255,255,255,0.94)"
              color="#111827"
              borderRadius="8px"
              boxShadow="0 16px 38px rgba(15,23,42,0.24)"
              p={{ base: 4, md: 5 }}
            >
              <Text fontSize="16px" fontWeight={900}>
                3, 10 Gateside St
              </Text>
              <Text mt={1} fontSize="13px" color="#4B5563">
                {ADDRESS}, UK
              </Text>
              <a
                href={GOOGLE_REVIEWS_URL}
                target="_blank"
                rel="noopener"
                style={{
                  alignItems: 'center',
                  background: DUKE.red,
                  borderRadius: 8,
                  color: '#fff',
                  display: 'inline-flex',
                  fontSize: 14,
                  fontWeight: 800,
                  marginTop: 12,
                  minHeight: 40,
                  padding: '0 14px',
                  textDecoration: 'none',
                }}
              >
                Open in Maps
              </a>
            </Box>
            <Box
              position="absolute"
              left="49%"
              top="54%"
              transform="translate(-50%, -100%)"
              filter="drop-shadow(0 10px 18px rgba(225,29,46,0.38))"
              aria-hidden
            >
              <Box
                w={{ base: '36px', md: '44px' }}
                h={{ base: '36px', md: '44px' }}
                bg={DUKE.red}
                border="3px solid #fff"
                borderRadius="999px 999px 999px 0"
                transform="rotate(-45deg)"
                display="grid"
                placeItems="center"
              >
                <Box w="10px" h="10px" borderRadius="999px" bg="#fff" />
              </Box>
            </Box>
            <Box position="absolute" right={3} bottom={3} bg="rgba(255,255,255,0.88)" borderRadius="6px" px={2} py={1}>
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" style={{ color: '#374151', fontSize: 11, textDecoration: 'none' }}>
                OpenStreetMap
              </a>
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}

function TyreBrandsSection() {
  return (
    <Box as="section" py={{ base: 12, md: 16 }} bg={DUKE.dark}>
      <Container maxW="6xl">
        <Stack gap={{ base: 7, md: 9 }}>
          <Stack gap={3} maxW="72ch">
            <Text color={DUKE.gold} fontWeight={800} fontSize="12px" letterSpacing={0}>
              TYRE BRAND OPTIONS
            </Text>
            <Heading
              as="h2"
              fontFamily="var(--font-display), Impact, sans-serif"
              fontSize={{ base: 'clamp(1.75rem, 7vw, 2.5rem)', md: 'clamp(2.25rem, 4vw, 3.25rem)' }}
              lineHeight="1.1"
              color="white"
              letterSpacing={0}
            >
              Tyre brands we offer
            </Heading>
            <Text color={DUKE.muted} fontSize={{ base: '16px', md: '18px' }} lineHeight={1.7}>
              We can supply and fit many leading tyre brands, subject to availability. Tell us your tyre size and we will confirm suitable options.
            </Text>
          </Stack>

          <SimpleGrid columns={{ base: 2, md: 3, lg: 4, xl: 5 }} gap={{ base: 3, md: 4 }}>
            {TYRE_BRANDS.map((name) => (
              <Box
                key={name}
                minH={{ base: '76px', md: '84px' }}
                display="grid"
                placeItems="center"
                px={{ base: 3, md: 4 }}
                py={4}
                border={`1px solid ${DUKE.border}`}
                borderRadius="8px"
                bg={DUKE.darkAlt}
                textAlign="center"
              >
                <Text color="white" fontSize={{ base: '14px', md: '16px' }} fontWeight={800} lineHeight={1.25}>
                  {name}
                </Text>
              </Box>
            ))}
          </SimpleGrid>

          <Stack gap={5}>
            <Text color={DUKE.muted} fontSize="14px" lineHeight={1.6}>
              Brand availability can vary by tyre size, location and time of day.
            </Text>
            <Stack direction={{ base: 'column', sm: 'row' }} gap={3} w={{ base: '100%', sm: 'auto' }}>
              <DukeButton href={telHref()} tone="red" className="duke-btn-call">
                <PhoneIcon size={18} />
                Call now
              </DukeButton>
              <DukeButton href={waHref('Hi, I need tyre options. My tyre size is:')} tone="green" target="_blank" rel="noopener">
                <WhatsAppIcon size={20} />
                WhatsApp tyre size
              </DukeButton>
              <DukeButton href="/book" tone="red" className="duke-btn-book">
                Book online
              </DukeButton>
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

function ReviewsSection() {
  return (
    <Box id="reviews" as="section" py={{ base: 14, md: 20 }} bg={DUKE.dark}>
      <Container maxW="6xl">
        <Stack gap={3} mb={10} align={{ base: 'flex-start', md: 'center' }}>
          <Text color={DUKE.gold} fontWeight={800} letterSpacing={0} fontSize="12px">
            REVIEWS · GOOGLE BUSINESS PROFILE
          </Text>
          <Heading
            as="h2"
            fontFamily="var(--font-display), Impact, sans-serif"
            fontSize={{ base: 'clamp(1.75rem, 6.5vw, 2.5rem)', md: 'clamp(2.5rem, 5vw, 4rem)' }}
            lineHeight="1.1"
            letterSpacing={0}
            textTransform="uppercase"
            color="white"
            textAlign={{ base: 'left', md: 'center' }}
          >
            What Scotland says about us.
          </Heading>
          <HStack gap={3} color={DUKE.muted} fontSize="14px">
            <HStack gap={1} aria-label="5 out of 5 stars">
              {[1, 2, 3, 4, 5].map((value) => (
                <Box key={value} as="span" color={DUKE.gold} fontSize="18px" lineHeight={1} aria-hidden>
                  ★
                </Box>
              ))}
            </HStack>
            <Text>5.0 from {GOOGLE_REVIEW_COUNT} Google reviews</Text>
          </HStack>
        </Stack>

        <Box
          p={8}
          border={`1px dashed ${DUKE.borderStrong}`}
          borderRadius="8px"
          textAlign="center"
          color={DUKE.muted}
        >
          <Text fontSize="14px">
            Reviews load from the Google Business Profile. See the full list on Google below.
          </Text>
        </Box>

        <HStack justify="center" mt={10}>
          <DukeButton href={GOOGLE_REVIEWS_URL} tone="ghost" target="_blank" rel="noopener">
            ★ See all reviews on Google
          </DukeButton>
        </HStack>
      </Container>
    </Box>
  );
}

function FaqSection() {
  return (
    <Box as="section" py={{ base: 16, md: 20 }}>
      <Container maxW="3xl">
        <SectionHeading eyebrow="FAQ">Quick answers</SectionHeading>
        <Stack gap={0}>
          {FAQS.map((item, index) => (
            <Box key={item.question} borderBottom={`1px solid ${DUKE.border}`}>
              <details open={index === 0} className="duke-faq-item">
                <summary>{item.question}</summary>
                <Text pb={4} color={DUKE.muted} fontSize="14px" lineHeight={1.6}>
                  {item.answer}
                </Text>
              </details>
            </Box>
          ))}
        </Stack>
      </Container>
    </Box>
  );
}

function CtaBlock() {
  return (
    <Box as="section" bg={DUKE.red} color="white" py={{ base: 14, md: 20 }}>
      <Container maxW="4xl" textAlign="center">
        <Heading
          as="h2"
          fontFamily="var(--font-display), Impact, sans-serif"
          fontSize={{ base: 'clamp(2rem, 8vw, 3rem)', md: 'clamp(3rem, 6vw, 5rem)' }}
          lineHeight="1.1"
          letterSpacing={0}
        >
          FLAT TYRE IN GLASGOW, EDINBURGH & DUNDEE?
        </Heading>
        <Text mt={4} fontSize={{ base: '16px', md: '18px' }} opacity={0.92}>
          One call. We are on the way in minutes. Average response {RESPONSE_TIME}, 24/7, every day.
        </Text>
        <a
          href={telHref()}
          className="duke-phone-hero-link"
          style={{
            alignItems: 'center',
            color: 'white',
            display: 'inline-flex',
            fontFamily: 'var(--font-display), Impact, sans-serif',
            fontSize: 'clamp(2.75rem, 12vw, 6rem)',
            gap: 12,
            letterSpacing: 0,
            lineHeight: 1,
            marginTop: 32,
            textDecoration: 'none',
          }}
        >
          <PhoneIcon size={48} />
          <span>{brand.phoneDisplay}</span>
        </a>
        <Stack direction={{ base: 'column', sm: 'row' }} justify="center" gap={3} mt={6}>
          <DukeButton href={telHref()} tone="white" className="duke-btn-call duke-btn-call-white">
            <PhoneIcon size={18} />
            Tap to call now
          </DukeButton>
          <DukeButton href={waHref()} tone="green" target="_blank" rel="noopener">
            <WhatsAppIcon size={20} />
            WhatsApp now
          </DukeButton>
          <DukeButton href="/book" tone="red" className="duke-btn-book">
            Book online
          </DukeButton>
        </Stack>
        <Text mt={6} fontSize="14px" opacity={0.85}>
          ✓ Open right now · ✓ Real fitter answers · ✓ Same live dispatch platform
        </Text>
      </Container>
    </Box>
  );
}

function Footer() {
  const year = new Date().getFullYear();

  return (
    <Box as="footer" bg={DUKE.darkAlt} borderTop={`1px solid ${DUKE.border}`} mt={20}>
      <Container maxW="6xl" py={12}>
        <SimpleGrid columns={{ base: 1, md: 3 }} gap={10}>
          <Stack gap={3}>
            <HStack gap={3}>
              <Image src="/duke-street-tyres-logo.svg" alt="Duke Street Tyres logo" width={48} height={48} />
              <Heading as="h3" fontSize="22px" fontFamily="var(--font-display), Impact, sans-serif" letterSpacing={0} color="white">
                DUKE STREET TYRES
              </Heading>
            </HStack>
            <Text color={DUKE.muted} fontSize="14px" lineHeight={1.6}>
              24/7 mobile tyre fitting across Glasgow, Edinburgh, Dundee and nearby Scotland coverage areas. Cars, vans and 4x4s. Average response {RESPONSE_TIME}.
            </Text>
          </Stack>

          <Stack gap={2}>
            <Heading as="h3" fontSize="16px" fontFamily="var(--font-display), Impact, sans-serif" letterSpacing={0} color="white">
              AREAS WE COVER
            </Heading>
            {['Scotland Coverage Areas', 'Mobile Tyre Fitting Glasgow', 'Mobile Tyre Fitting Edinburgh', 'Mobile Tyre Fitting Dundee', 'Roadside Tyre Replacement'].map((item) => (
              <Link key={item} href="#coverage" style={{ color: DUKE.white, textDecoration: 'none' }}>
                {item}
              </Link>
            ))}
          </Stack>

          <Stack gap={2}>
            <Heading as="h3" fontSize="16px" fontFamily="var(--font-display), Impact, sans-serif" letterSpacing={0} color="white">
              CONTACT
            </Heading>
            <Text>{brand.name}</Text>
            <Text color={DUKE.muted}>{ADDRESS}</Text>
            <Text>
              <a href={GOOGLE_REVIEWS_URL} target="_blank" rel="noopener" style={{ color: DUKE.gold, textDecoration: 'none' }}>
                View on Google Maps →
              </a>
            </Text>
            <Text>
              Phone:{' '}
              <a href={telHref()} style={{ color: DUKE.gold, textDecoration: 'none' }}>
                {brand.phoneDisplay}
              </a>
            </Text>
            <Text>
              WhatsApp:{' '}
              <Box as="span" color={DUKE.gold}>
                07423 262 955
              </Box>
            </Text>
            <Text color={DUKE.muted}>Open 24/7</Text>
          </Stack>
        </SimpleGrid>

        <Stack mt={10} direction={{ base: 'column', md: 'row' }} justify="space-between" gap={3}>
          <Text fontSize="12px" color={DUKE.muted}>
            © {year} {brand.legalName}. All rights reserved.
          </Text>
          <HStack gap={4} fontSize="12px">
            <Link href="/privacy-policy" style={{ color: DUKE.white, textDecoration: 'none' }}>
              Privacy
            </Link>
            <Link href="/terms-of-service" style={{ color: DUKE.white, textDecoration: 'none' }}>
              Terms
            </Link>
            <Link href="/book" style={{ color: DUKE.gold, textDecoration: 'none' }}>
              Book
            </Link>
          </HStack>
        </Stack>
      </Container>
    </Box>
  );
}

function WhatsAppFab() {
  return (
    <Box
      display={{ base: 'none', md: 'grid' }}
      placeItems="center"
      position="fixed"
      right={6}
      bottom={6}
      zIndex={1100}
      w="64px"
      h="64px"
      borderRadius="999px"
      bg={DUKE.green}
      color="white"
      boxShadow="0 8px 24px rgba(37,211,102,0.45)"
      className="duke-whatsapp-fab"
    >
      <a href={waHref()} target="_blank" rel="noopener" aria-label="Chat on WhatsApp" style={{ color: 'inherit', display: 'grid', placeItems: 'center' }}>
        <WhatsAppIcon size={28} />
      </a>
    </Box>
  );
}

function StickyCallBar() {
  return (
    <Box
      display={{ base: 'flex', md: 'none' }}
      position="fixed"
      left={0}
      right={0}
      bottom={0}
      zIndex={1100}
      h="64px"
      pb="env(safe-area-inset-bottom)"
      className="sticky-cta-bar duke-sticky-call-bar"
    >
      <a href={telHref()} aria-label="Call now" className="duke-sticky-call-button" style={{ alignItems: 'center', background: DUKE.red, color: 'white', display: 'flex', flex: '1.12 1 0', fontWeight: 800, justifyContent: 'center', minWidth: 0, textDecoration: 'none' }}>
        <HStack gap={2}>
          <PhoneIcon size={18} />
          <Text fontSize="15px">Call</Text>
        </HStack>
      </a>
      <Link href="/book" aria-label="Book mobile tyre fitting online" className="duke-sticky-book-button" style={{ alignItems: 'center', background: DUKE.redDark, color: 'white', display: 'flex', flex: '0.88 1 0', fontWeight: 800, justifyContent: 'center', minWidth: 0, textDecoration: 'none' }}>
        <Text fontSize="15px">Book</Text>
      </Link>
    </Box>
  );
}

function DukeStyle() {
  return (
    <style>{`
      .duke-page {
        background:
          radial-gradient(circle at 78% 12%, rgba(225,29,46,0.14), transparent 34rem),
          radial-gradient(circle at 16% 52%, rgba(225,29,46,0.08), transparent 30rem),
          linear-gradient(180deg, rgba(11,15,20,1) 0%, rgba(17,22,29,0.98) 48%, rgba(11,15,20,1) 100%),
          ${DUKE.dark};
        color: ${DUKE.white};
        overflow-x: hidden;
      }

      .duke-page h1,
      .duke-page h2,
      .duke-page h3,
      .duke-page h4 {
        font-family: var(--font-display), Impact, sans-serif;
        letter-spacing: 0;
      }

      .duke-hero-section {
        min-height: auto;
        background:
          radial-gradient(circle at 74% 28%, rgba(225,29,46,0.18), transparent 34rem),
          linear-gradient(180deg, rgba(11,15,20,1), rgba(12,17,23,1));
      }

      .duke-hero-photo-bg {
        position: absolute;
        inset: 0;
        background:
          linear-gradient(112deg, transparent 0 61%, rgba(225,29,46,0.10) 61% 62%, transparent 62% 100%),
          linear-gradient(118deg, transparent 0 70%, rgba(225,29,46,0.10) 70% 71%, transparent 71% 100%);
        opacity: 0.8;
        pointer-events: none;
      }

      .duke-hero-texture {
        position: absolute;
        inset: 0;
        background:
          repeating-linear-gradient(135deg, rgba(255,255,255,0.018) 0 1px, transparent 1px 24px);
        opacity: 0.32;
        pointer-events: none;
      }

      .duke-btn {
        backface-visibility: hidden;
        box-shadow: 0 8px 22px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.12);
        isolation: isolate;
        overflow: hidden;
        transform: translateZ(0);
        transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease !important;
        will-change: transform;
      }

      .duke-btn::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(255,255,255,0.14), transparent);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }

      .duke-btn-red {
        box-shadow: 0 9px 24px rgba(225,29,46,0.28), inset 0 1px 0 rgba(255,255,255,0.12);
      }

      .duke-btn-green {
        box-shadow: 0 9px 24px rgba(37,211,102,0.22), inset 0 1px 0 rgba(255,255,255,0.12);
      }

      .duke-btn-gold {
        box-shadow: 0 9px 24px rgba(225,29,46,0.28), inset 0 1px 0 rgba(255,255,255,0.18);
      }

      .duke-btn-ghost {
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
      }

      .duke-btn-call {
        animation: dukeCallPulse 1.28s cubic-bezier(0.45, 0, 0.25, 1) infinite;
        overflow: visible;
        text-shadow: 0 1px 10px rgba(0,0,0,0.34);
      }

      .duke-btn-call::before {
        background: linear-gradient(105deg, transparent 0%, transparent 34%, rgba(255,255,255,0.34) 47%, rgba(255,255,255,0.58) 50%, rgba(255,255,255,0.24) 56%, transparent 68%, transparent 100%);
        opacity: 0.76;
        transform: translateX(-150%) skewX(-14deg);
        animation: dukeCallSweep 2.05s ease-in-out infinite;
      }

      .duke-btn-call::after {
        content: "";
        position: absolute;
        inset: -7px;
        z-index: -1;
        border: 2px solid rgba(225,29,46,0.72);
        border-radius: 14px;
        box-shadow: 0 0 28px rgba(225,29,46,0.42);
        opacity: 0;
        animation: dukeCallRing 1.28s ease-out infinite;
        pointer-events: none;
      }

      .duke-btn-call-white::after {
        border-color: rgba(255,255,255,0.72);
      }

      .duke-btn-call svg,
      .duke-sticky-call-button svg,
      .duke-phone-hero-link svg {
        animation: dukePhoneNudge 1.28s ease-in-out infinite;
        transform-origin: center;
      }

      .duke-btn-book::before,
      .duke-form-submit::before {
        background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.28) 42%, rgba(255,255,255,0.46) 50%, rgba(255,255,255,0.22) 58%, transparent 100%);
        opacity: 0.7;
        transform: translateX(-140%) skewX(-16deg);
        animation: dukeButtonSweep 3.2s ease-in-out infinite;
      }

      .duke-sticky-call-button {
        isolation: isolate;
        overflow: visible;
        position: relative;
        text-shadow: 0 1px 10px rgba(0,0,0,0.34);
        animation: dukeStickyCallPulse 1.28s cubic-bezier(0.45, 0, 0.25, 1) infinite;
      }

      .duke-sticky-call-button::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        background: linear-gradient(105deg, transparent 0%, transparent 34%, rgba(255,255,255,0.30) 48%, rgba(255,255,255,0.58) 50%, rgba(255,255,255,0.20) 58%, transparent 70%, transparent 100%);
        transform: translateX(-145%) skewX(-14deg);
        animation: dukeCallSweep 2.05s ease-in-out infinite;
        pointer-events: none;
      }

      .duke-sticky-call-button::after {
        content: "";
        position: absolute;
        inset: 8px 18px;
        z-index: 0;
        border: 1px solid rgba(255,255,255,0.58);
        border-radius: 999px;
        box-shadow: 0 0 30px rgba(225,29,46,0.44);
        opacity: 0;
        transform: scale(0.92);
        animation: dukeStickyCallRing 1.28s ease-out infinite;
        pointer-events: none;
      }

      .duke-sticky-call-button > * {
        position: relative;
        z-index: 1;
      }

      .duke-btn-call:focus-visible,
      .duke-sticky-call-button:focus-visible {
        outline: 3px solid rgba(255,255,255,0.74);
        outline-offset: 4px;
      }

      .duke-sticky-book-button {
        position: relative;
        overflow: hidden;
      }

      .duke-sticky-book-button::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.24) 48%, transparent 100%);
        transform: translateX(-120%) skewX(-16deg);
        animation: dukeButtonSweep 3.2s ease-in-out infinite;
        pointer-events: none;
      }

      .duke-phone-hero-link {
        animation: dukePhoneGlow 1.75s ease-in-out infinite;
      }

      .duke-btn:hover {
        box-shadow: 0 13px 30px rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.14) inset !important;
        filter: brightness(1.04);
        transform: translateY(-2px) !important;
      }

      .duke-btn:hover::before {
        opacity: 1;
      }

      .duke-btn:active {
        box-shadow: 0 6px 18px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.1) !important;
        transform: translateY(0) !important;
      }

      .duke-btn svg {
        transition: transform 0.22s ease;
      }

      .duke-btn:hover svg {
        transform: translateX(2px) scale(1.03);
      }

      .duke-form-submit {
        position: relative;
      }

      .duke-photo-gallery {
        position: relative;
        z-index: 0;
      }

      .duke-photo-gallery::before {
        content: none;
      }

      .duke-main-photo {
        box-shadow:
          0 18px 48px rgba(0,0,0,0.50),
          0 0 0 1px rgba(255,255,255,0.05) inset;
        isolation: isolate;
      }

      .duke-main-photo::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 2;
        background: linear-gradient(180deg, rgba(0,0,0,0.02) 45%, rgba(0,0,0,0.34) 100%);
        pointer-events: none;
      }

      .duke-main-photo::after {
        content: none;
      }

      .duke-photo-image {
        transform: scale(1);
        transition: transform 0.45s ease, filter 0.45s ease;
      }

      .duke-main-photo:hover .duke-photo-image,
      .duke-thumb:hover .duke-photo-image {
        filter: saturate(1.07) contrast(1.03);
        transform: scale(1.025);
      }

      .duke-photo-vignette {
        position: absolute;
        inset: 0;
        z-index: 4;
        background: linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.52) 100%);
        pointer-events: none;
      }

      .duke-photo-badge {
        position: absolute;
        left: 14px;
        bottom: 14px;
        z-index: 5;
        padding: 8px 11px;
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 8px;
        background: rgba(11,15,20,0.72);
        box-shadow: 0 10px 26px rgba(0,0,0,0.40);
        backdrop-filter: blur(12px);
      }

      .duke-thumb {
        box-shadow: 0 10px 30px rgba(0,0,0,0.36);
        transform: translateY(0);
        transition: border-color 0.28s ease, box-shadow 0.28s ease, transform 0.28s ease;
      }

      .duke-thumb::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, transparent, rgba(0,0,0,0.3));
        pointer-events: none;
      }

      .duke-thumb:hover {
        border-color: rgba(225,29,46,0.54) !important;
        box-shadow: 0 14px 34px rgba(0,0,0,0.42);
        transform: translateY(-2px);
      }

      .duke-marquee {
        display: inline-block;
        white-space: nowrap;
        animation: dukeMarquee 28s linear infinite;
      }

      .duke-hero-shimmer {
        color: #ffffff;
        -webkit-text-fill-color: #ffffff;
        text-shadow:
          0 1px 0 rgba(225,29,46,0.18),
          0 18px 46px rgba(0,0,0,0.48);
      }

      .duke-hero-actions .duke-btn {
        white-space: nowrap;
      }

      @media (max-width: 767px) {
        .duke-hero-copy {
          align-self: flex-start;
          max-width: min(350px, calc(100vw - 40px));
          width: 100%;
        }

        .duke-hero-actions {
          flex-direction: column !important;
          width: 100% !important;
        }

        .duke-hero-actions .duke-btn {
          flex: 1 1 auto !important;
          width: 100% !important;
        }

        .duke-photo-badge {
          top: 12px;
          bottom: auto;
          left: 12px;
          padding: 7px 10px;
        }

      }

      @media (min-width: 768px) {
        .duke-hero-actions .duke-btn {
          flex: 0 0 auto !important;
          min-width: 172px;
          width: auto !important;
        }

        .duke-hero-actions .duke-btn-red {
          min-width: 196px;
        }
      }

      .duke-live-dot {
        box-shadow: 0 0 0 0 rgba(16,185,129,0.6);
        animation: dukeLiveDot 1.6s ease-out infinite;
      }

      .duke-whatsapp-fab::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 999px;
        border: 2px solid rgba(37,211,102,0.55);
        animation: dukeWaPulse 2s ease-out infinite;
      }

      .duke-faq-item summary {
        color: white;
        cursor: pointer;
        font-weight: 800;
        list-style: none;
        padding: 16px 0;
      }

      .duke-faq-item summary::-webkit-details-marker {
        display: none;
      }

      .duke-faq-item summary::after {
        content: "+";
        float: right;
        color: ${DUKE.gold};
        font-size: 20px;
      }

      .duke-faq-item[open] summary::after {
        content: "-";
      }

      @keyframes dukeMarquee {
        from { transform: translateX(0); }
        to { transform: translateX(-50%); }
      }

      @keyframes dukeLiveDot {
        0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.6); }
        70% { box-shadow: 0 0 0 10px rgba(16,185,129,0); }
      }

      @keyframes dukeWaPulse {
        0% { transform: scale(1); opacity: 0.7; }
        100% { transform: scale(1.6); opacity: 0; }
      }

      @keyframes dukeCallPulse {
        0%, 100% {
          box-shadow: 0 10px 28px rgba(225,29,46,0.36), 0 0 0 0 rgba(225,29,46,0.48), inset 0 1px 0 rgba(255,255,255,0.16);
          filter: brightness(1);
        }
        50% {
          box-shadow: 0 18px 42px rgba(225,29,46,0.58), 0 0 0 9px rgba(225,29,46,0.20), 0 0 36px rgba(255,255,255,0.16), inset 0 1px 0 rgba(255,255,255,0.28);
          filter: brightness(1.12) saturate(1.1);
        }
      }

      @keyframes dukeCallRing {
        0% { opacity: 0.9; transform: scale(0.98); }
        66%, 100% { opacity: 0; transform: scale(1.18); }
      }

      @keyframes dukePhoneNudge {
        0%, 44%, 100% { transform: rotate(0deg) scale(1); }
        8% { transform: rotate(-15deg) scale(1.12); }
        16% { transform: rotate(14deg) scale(1.12); }
        24% { transform: rotate(-10deg) scale(1.08); }
        32% { transform: rotate(7deg) scale(1.05); }
      }

      @keyframes dukeCallSweep {
        0%, 46% { transform: translateX(-150%) skewX(-14deg); }
        70%, 100% { transform: translateX(150%) skewX(-14deg); }
      }

      @keyframes dukeButtonSweep {
        0%, 38% { transform: translateX(-140%) skewX(-16deg); }
        58%, 100% { transform: translateX(140%) skewX(-16deg); }
      }

      @keyframes dukeStickyCallPulse {
        0%, 100% { filter: brightness(1); box-shadow: inset 0 1px 0 rgba(255,255,255,0.14), 0 -8px 22px rgba(225,29,46,0.18); }
        50% { filter: brightness(1.16) saturate(1.1); box-shadow: inset 0 1px 0 rgba(255,255,255,0.28), 0 -12px 34px rgba(225,29,46,0.54), 0 0 0 5px rgba(225,29,46,0.14); }
      }

      @keyframes dukeStickyCallRing {
        0% { opacity: 0.85; transform: scale(0.92); }
        68%, 100% { opacity: 0; transform: scale(1.14); }
      }

      @keyframes dukePhoneGlow {
        0%, 100% { text-shadow: 0 18px 46px rgba(0,0,0,0.48), 0 0 0 rgba(255,255,255,0); }
        50% { text-shadow: 0 18px 46px rgba(0,0,0,0.48), 0 0 22px rgba(255,255,255,0.36); }
      }

      @media (max-width: 767px) {
        .duke-marquee {
          display: none;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .duke-marquee,
        .duke-hero-shimmer,
        .duke-live-dot,
        .duke-whatsapp-fab::before,
        .duke-btn-call,
        .duke-btn-call::after,
        .duke-btn-call svg,
        .duke-sticky-call-button,
        .duke-sticky-call-button svg,
        .duke-sticky-book-button::after,
        .duke-phone-hero-link,
        .duke-phone-hero-link svg,
        .duke-btn-book::before,
        .duke-form-submit::before {
          animation: none !important;
        }

        .duke-hero-shimmer {
          background: none !important;
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
          filter: none !important;
          text-shadow: 0 18px 46px rgba(0,0,0,0.48) !important;
        }
      }
    `}</style>
  );
}

export function DukeHomePage() {
  return (
    <Box className="duke-page" minH="100vh" bg={DUKE.dark} color={DUKE.white}>
      <DukeStyle />
      <Header />
      <Box id="main-content" as="main">
        <Hero />
        <TrustRow />
        <TrustStrip />
        <BigCallBanner />
        <CityIntro />
        <PricingStrip />
        <HowItWorks />
        <WhyUs />
        <CoverageSection />
        <TyreBrandsSection />
        <ReviewsSection />
        <FaqSection />
        <CtaBlock />
      </Box>
      <Footer />
      <WhatsAppFab />
      <StickyCallBar />
    </Box>
  );
}
