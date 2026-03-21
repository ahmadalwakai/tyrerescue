'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Box,
  Container,
  Heading,
  Text,
  Flex,
  Input,
} from '@chakra-ui/react';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { colorTokens } from '@/lib/design-tokens';

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

export function TrackingLookup() {
  const router = useRouter();
  const [ref, setRef] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = ref.trim().toUpperCase();
    if (!trimmed) {
      setError('Please enter your booking reference.');
      return;
    }
    if (!/^[A-Z0-9-]+$/.test(trimmed)) {
      setError('Invalid reference format. Check your confirmation email.');
      return;
    }
    setError('');
    router.push(`/tracking/${encodeURIComponent(trimmed)}`);
  }

  return (
    <Box minH="100vh" display="flex" flexDirection="column" bg={c.bg}>
      <Nav />
      <Box as="main" flex={1} display="flex" alignItems="center" justifyContent="center" py={20}>
        <Container maxW="md" textAlign="center">
          <Heading
            as="h1"
            fontSize={{ base: '28px', md: '36px' }}
            fontWeight="900"
            color={c.text}
            letterSpacing="-0.03em"
            lineHeight="1.15"
            mb={3}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Track Your Booking
          </Heading>
          <Text color={c.muted} fontSize="16px" mb={8} lineHeight="1.6">
            Enter your booking reference to see live driver tracking and status
            updates. You can find the reference in your confirmation email or
            SMS.
          </Text>

          <Box
            as="form"
            onSubmit={handleSubmit}
            bg={c.surface}
            borderRadius="12px"
            border="1px solid"
            borderColor={c.border}
            p={6}
          >
            <Text
              fontSize="12px"
              fontWeight="600"
              color={c.muted}
              textTransform="uppercase"
              letterSpacing="0.1em"
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
              placeholder="e.g. TR-20260320-ABC1"
              size="lg"
              bg={c.inputBg}
              borderColor={error ? '#EF4444' : c.inputBorder}
              color={c.text}
              _placeholder={{ color: c.placeholder }}
              _focus={{ borderColor: c.inputBorderFocus, outline: 'none' }}
              mb={error ? 2 : 4}
              textTransform="uppercase"
              letterSpacing="0.05em"
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
                background: c.accent,
                color: 'white',
                fontWeight: 700,
                fontSize: '16px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.05em',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = c.accentHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = c.accent; }}
            >
              TRACK BOOKING
            </button>
          </Box>

          <Flex gap={4} justify="center" mt={8}>
            <Link
              href="tel:+441412660690"
              style={{
                color: c.muted,
                fontSize: '13px',
                textDecoration: 'none',
                transition: 'color 0.2s',
              }}
            >
              Call 0141 266 0690
            </Link>
            <Text color={c.border} fontSize="13px">|</Text>
            <Link
              href="/contact"
              style={{
                color: c.muted,
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
      <Footer />
    </Box>
  );
}
