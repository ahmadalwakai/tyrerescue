'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Box,
  Container,
  Heading,
  Text,
  Flex,
  HStack,
  Input,
} from '@chakra-ui/react';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { colorTokens } from '@/lib/design-tokens';
import type { CustomerBrandConfig } from '@/lib/config/site';

const c = {
  bg: colorTokens.bg,
  surface: colorTokens.surface,
  accent: colorTokens.accent,
  accentHover: colorTokens.accentHover,
  text: colorTokens.text,
  muted: colorTokens.muted,
  border: colorTokens.border,
  inputBg: colorTokens.input.bg,
  inputBorder: colorTokens.input.border,
  inputBorderFocus: colorTokens.input.borderFocus,
  placeholder: colorTokens.input.placeholder,
};

export function TrackingLookup({ brand }: { brand: CustomerBrandConfig }) {
  const router = useRouter();
  const [ref, setRef] = useState('');
  const [error, setError] = useState('');
  const isDuke = brand.key === 'duke_street_tyres';
  const palette = isDuke
    ? {
        bg: '#0B0F14',
        surface: '#111827',
        accent: '#F5B301',
        accentHover: '#E0A300',
        buttonText: '#0B0F14',
        text: '#FFFFFF',
        muted: 'rgba(255,255,255,0.72)',
        border: 'rgba(255,255,255,0.14)',
        inputBg: '#0B0F14',
        inputBorder: 'rgba(255,255,255,0.22)',
        inputBorderFocus: '#F5B301',
        placeholder: 'rgba(255,255,255,0.45)',
      }
    : {
        bg: c.bg,
        surface: c.surface,
        accent: c.accent,
        accentHover: c.accentHover,
        buttonText: 'white',
        text: c.text,
        muted: c.muted,
        border: c.border,
        inputBg: c.inputBg,
        inputBorder: c.inputBorder,
        inputBorderFocus: c.inputBorderFocus,
        placeholder: c.placeholder,
      };

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    let trimmed = ref.trim().toUpperCase();
    // Strip common prefixes like "BOOKING" or "BOOKING:"
    trimmed = trimmed.replace(/^BOOKING[:\s]+/i, '').trim();
    if (!trimmed) {
      setError('Please enter your booking reference.');
      return;
    }
    if (!/^[A-Z]{2,4}-\d{4}-\d{3,6}$/.test(trimmed)) {
      setError('Invalid format. Enter the reference like TYR-2026-63413.');
      return;
    }
    setError('');
    router.push(`/tracking/${encodeURIComponent(trimmed)}`);
  }

  return (
    <Box minH="100vh" display="flex" flexDirection="column" bg={palette.bg}>
      {isDuke ? (
        <Box
          as="header"
          bg="rgba(11,15,20,0.9)"
          borderBottom="1px solid rgba(255,255,255,0.12)"
        >
          <Container maxW="7xl" py={3}>
            <Flex align="center" justify="space-between" gap={4}>
              <Link href="/" style={{ color: 'white', textDecoration: 'none' }}>
                <Text
                  fontFamily="var(--font-display), sans-serif"
                  fontSize={{ base: '26px', md: '34px' }}
                  lineHeight={1}
                  letterSpacing={0}
                >
                  {brand.name}
                </Text>
              </Link>
              <HStack gap={3}>
                <Link
                  href={`tel:${brand.phoneTel}`}
                  style={{
                    color: '#FFFFFF',
                    fontWeight: 800,
                    textDecoration: 'none',
                  }}
                >
                  {brand.phoneDisplay}
                </Link>
                <Link
                  href="/book"
                  style={{
                    minHeight: 44,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    background: '#F5B301',
                    color: '#0B0F14',
                    fontWeight: 900,
                    padding: '0 16px',
                    textDecoration: 'none',
                  }}
                >
                  Book
                </Link>
              </HStack>
            </Flex>
          </Container>
        </Box>
      ) : (
        <Nav />
      )}
      <Box as="main" flex={1} display="flex" alignItems="center" justifyContent="center" py={20}>
        <Container maxW="md" textAlign="center">
          <Heading
            as="h1"
            fontSize={{ base: '28px', md: '36px' }}
            fontWeight="900"
            color={palette.text}
            letterSpacing={0}
            lineHeight="1.15"
            mb={3}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Track Your Booking
          </Heading>
          <Text color={palette.muted} fontSize="16px" mb={8} lineHeight="1.6">
            Enter your booking reference to see live driver tracking and status
            updates. You can find the reference in your confirmation email.
          </Text>

          <Box
            as="form"
            onSubmit={handleSubmit}
            bg={palette.surface}
            borderRadius="8px"
            border="1px solid"
            borderColor={palette.border}
            p={6}
          >
            <Text
              fontSize="12px"
              fontWeight="600"
              color={palette.muted}
              textTransform="uppercase"
              letterSpacing={0}
              mb={2}
              textAlign="left"
            >
              Booking Reference
            </Text>
            <Input
              value={ref}
              onChange={(e) => {
                setRef(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. TYR-2026-63413"
              size="lg"
              bg={palette.inputBg}
              borderColor={error ? '#EF4444' : palette.inputBorder}
              color={palette.text}
              _placeholder={{ color: palette.placeholder }}
              _focus={{ borderColor: palette.inputBorderFocus, outline: 'none' }}
              mb={error ? 2 : 4}
              textTransform="uppercase"
              letterSpacing={0}
              fontWeight="600"
              autoComplete="off"
              autoFocus
            />
            {error && (
              <Text fontSize="13px" color="#EF4444" mb={3} textAlign="left">
                {error}
              </Text>
            )}
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '14px',
                background: palette.accent,
                color: palette.buttonText,
                fontWeight: 700,
                fontSize: '16px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                letterSpacing: 0,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = palette.accentHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = palette.accent; }}
            >
              Track booking
            </button>
          </Box>

          <Flex gap={4} justify="center" mt={8}>
            <Link
              href={`tel:${brand.phoneTel}`}
              style={{
                color: palette.muted,
                fontSize: '13px',
                textDecoration: 'none',
                transition: 'color 0.2s',
              }}
            >
              Call {brand.phoneDisplay}
            </Link>
            <Text color={palette.border} fontSize="13px">|</Text>
            <Link
              href="/contact"
              style={{
                color: palette.muted,
                fontSize: '13px',
                textDecoration: 'none',
                transition: 'color 0.2s',
              }}
            >
              Contact Support
            </Link>
          </Flex>
        </Container>
      </Box>
      {isDuke ? (
        <Box as="footer" borderTop="1px solid rgba(255,255,255,0.12)" py={6}>
          <Container maxW="7xl">
            <Flex justify="space-between" gap={4} direction={{ base: 'column', md: 'row' }}>
              <Text color="rgba(255,255,255,0.72)" fontSize="14px">
                {brand.name}
              </Text>
              <HStack gap={4} color="rgba(255,255,255,0.72)" fontSize="14px">
                <Link href="/privacy-policy" style={{ color: 'inherit' }}>Privacy</Link>
                <Link href="/terms-of-service" style={{ color: 'inherit' }}>Terms</Link>
              </HStack>
            </Flex>
          </Container>
        </Box>
      ) : (
        <Footer />
      )}
    </Box>
  );
}
