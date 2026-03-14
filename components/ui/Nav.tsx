'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Box, Container, Flex, Text, Link as ChakraLink, VStack } from '@chakra-ui/react';
import Link from 'next/link';
import { colorTokens } from '@/lib/design-tokens';

const colors = {
  bg: colorTokens.bg,
  accent: colorTokens.accent,
  textPrimary: colorTokens.text,
  textSecondary: colorTokens.muted,
  border: colorTokens.border,
};

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'Emergency', href: '/emergency' },
  { label: 'Book', href: '/book' },
  { label: 'Tyres', href: '/tyres' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
];

const pulseGlowKeyframes = `
  @keyframes pulseGlow {
    0% { box-shadow: 0 0 0 0 rgba(249,115,22,0.4); }
    70% { box-shadow: 0 0 0 12px rgba(249,115,22,0); }
    100% { box-shadow: 0 0 0 0 rgba(249,115,22,0); }
  }
`;

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user;

  return (
    <>
      <style>{pulseGlowKeyframes}</style>
      <Box
        as="header"
        position="sticky"
        top={0}
        zIndex={50}
        bg="rgba(9,9,11,0.85)"
        backdropFilter="blur(20px)"
        borderBottomWidth="1px"
        borderColor={colors.border}
        h="64px"
        display="flex"
        alignItems="center"
      >
        <Container maxW="7xl">
          <Flex justify="space-between" align="center">
            <Link href="/" style={{ textDecoration: 'none' }}>
              <Flex direction="column" gap={0}>
                <Text
                  fontSize="28px"
                  color={colors.textPrimary}
                  lineHeight="1"
                  letterSpacing="0.1em"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  TYRE RESCUE
                </Text>
                <Text
                  fontSize="10px"
                  color={colors.textSecondary}
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  Powered by Duke Street Tyres
                </Text>
              </Flex>
            </Link>

            <Flex
              as="nav"
              gap={8}
              display={{ base: 'none', md: 'flex' }}
            >
              {navLinks.map((link) => (
                <ChakraLink
                  key={link.href}
                  asChild
                  fontSize="13px"
                  color={colors.textSecondary}
                  _hover={{ color: colors.textPrimary }}
                  transition="color 0.2s"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  <Link href={link.href}>{link.label}</Link>
                </ChakraLink>
              ))}
            </Flex>

            <Flex gap={4} align="center">
              {/* Mobile menu toggle */}
              <Text
                display={{ base: 'block', md: 'none' }}
                color={colors.textSecondary}
                fontSize="13px"
                letterSpacing="0.1em"
                cursor="pointer"
                _hover={{ color: colors.textPrimary }}
                onClick={() => setMobileOpen(!mobileOpen)}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {mobileOpen ? 'CLOSE' : 'MENU'}
              </Text>

              {isLoggedIn ? (
                <Flex gap={3} align="center" display={{ base: 'none', sm: 'flex' }}>
                  <Text
                    fontSize="13px"
                    color={colors.textSecondary}
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {session.user?.name}
                  </Text>
                  <Text
                    as="button"
                    fontSize="13px"
                    color={colors.textSecondary}
                    bg="transparent"
                    border="none"
                    cursor="pointer"
                    _hover={{ color: 'red.400' }}
                    transition="color 0.2s"
                    style={{ fontFamily: 'var(--font-body)' }}
                    onClick={() => signOut({ callbackUrl: '/login' })}
                  >
                    Sign Out
                  </Text>
                </Flex>
              ) : (
                <ChakraLink
                  asChild
                  fontSize="13px"
                  color={colors.textSecondary}
                  _hover={{ color: colors.textPrimary }}
                  transition="color 0.2s"
                  display={{ base: 'none', sm: 'block' }}
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  <Link href="/login">Sign In</Link>
                </ChakraLink>
              )}
              <ChakraLink
                asChild
                px="24px"
                py="10px"
                bg={colors.accent}
                color={colors.bg}
                fontSize="16px"
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
                <Link href="/emergency">EMERGENCY</Link>
              </ChakraLink>
            </Flex>
          </Flex>
        </Container>
      </Box>

      {/* Mobile overlay */}
      {mobileOpen && (
        <Box
          position="fixed"
          inset={0}
          top="64px"
          zIndex={49}
          bg="rgba(9,9,11,0.97)"
          backdropFilter="blur(20px)"
          display={{ base: 'flex', md: 'none' }}
          alignItems="center"
          justifyContent="center"
        >
          <VStack gap={6}>
            {navLinks.map((link) => (
              <ChakraLink
                key={link.href}
                asChild
                fontSize="24px"
                color={colors.textSecondary}
                letterSpacing="0.1em"
                _hover={{ color: colors.accent }}
                transition="color 0.2s"
                style={{ fontFamily: 'var(--font-display)' }}
                onClick={() => setMobileOpen(false)}
              >
                <Link href={link.href}>{link.label.toUpperCase()}</Link>
              </ChakraLink>
            ))}
            {isLoggedIn ? (
              <Text
                as="button"
                fontSize="24px"
                color={colors.textSecondary}
                letterSpacing="0.1em"
                bg="transparent"
                border="none"
                cursor="pointer"
                _hover={{ color: 'red.400' }}
                transition="color 0.2s"
                style={{ fontFamily: 'var(--font-display)' }}
                onClick={() => {
                  setMobileOpen(false);
                  signOut({ callbackUrl: '/login' });
                }}
              >
                SIGN OUT
              </Text>
            ) : (
              <ChakraLink
                asChild
                fontSize="24px"
                color={colors.textSecondary}
                letterSpacing="0.1em"
                _hover={{ color: colors.accent }}
                transition="color 0.2s"
                style={{ fontFamily: 'var(--font-display)' }}
                onClick={() => setMobileOpen(false)}
              >
                <Link href="/login">SIGN IN</Link>
              </ChakraLink>
            )}
          </VStack>
        </Box>
      )}
    </>
  );
}
