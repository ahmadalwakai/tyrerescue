'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
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
  { label: 'Blog', href: '/blog' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
];

const pulseGlowKeyframes = `
  @keyframes pulseGlow {
    0% { box-shadow: 0 0 0 0 rgba(249,115,22,0.4); }
    70% { box-shadow: 0 0 0 12px rgba(249,115,22,0); }
    100% { box-shadow: 0 0 0 0 rgba(249,115,22,0); }
  }
  @keyframes pulseGlowSoft {
    0% { box-shadow: 0 0 0 0 rgba(249,115,22,0.25); }
    70% { box-shadow: 0 0 0 8px rgba(249,115,22,0); }
    100% { box-shadow: 0 0 0 0 rgba(249,115,22,0); }
  }
`;

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const pathname = usePathname();
  const isLoggedIn = mounted && !!session?.user;
  const isHome = pathname === '/';

  const onScroll = useCallback(() => {
    setScrolled(window.scrollY > 20);
  }, []);

  useEffect(() => {
    setMounted(true);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  // Focus trap for mobile menu
  useEffect(() => {
    if (!mobileOpen || !mobileMenuRef.current) return;
    const menu = mobileMenuRef.current;
    const focusable = menu.querySelectorAll<HTMLElement>('a, button, [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) focusable[0].focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        return;
      }
      if (e.key !== 'Tab' || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  return (
    <>
      <style>{pulseGlowKeyframes}</style>
      <Box
        as="header"
        position="sticky"
        top={0}
        zIndex={50}
        bg={scrolled ? 'rgba(9,9,11,0.92)' : 'rgba(9,9,11,0.85)'}
        backdropFilter="blur(20px)"
        borderBottomWidth="1px"
        borderColor={scrolled ? colors.border : 'transparent'}
        h="64px"
        display="flex"
        alignItems="center"
        transition="background 0.3s, border-color 0.3s"
        style={{ animation: 'fadeIn 0.4s ease-out both' }}
      >
        <Container maxW="7xl">
          <Flex justify="space-between" align="center">
            <Link href="/" style={{ textDecoration: 'none' }}>
              <img
                src="/logo.svg"
                alt="Tyre Rescue"
                style={{ height: '44px', width: 'auto', objectFit: 'contain' }}
              />
            </Link>

            <Flex
              as="nav"
              gap={8}
              display={{ base: 'none', md: 'flex' }}
            >
              {navLinks.map((link) => {
                const isActive = link.href === '/' ? isHome : pathname.startsWith(link.href);
                return (
                <ChakraLink
                  key={link.href}
                  asChild
                  fontSize="13px"
                  color={isActive ? colors.accent : colors.textSecondary}
                  _hover={{ color: colors.textPrimary }}
                  transition="color 0.2s"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  <Link href={link.href}>{link.label}</Link>
                </ChakraLink>
                );
              })}
            </Flex>

            <Flex gap={4} align="center">
              {/* Mobile menu toggle */}
              <Box
                as="button"
                display={{ base: 'block', md: 'none' }}
                color={colors.textSecondary}
                fontSize="13px"
                letterSpacing="0.1em"
                cursor="pointer"
                bg="transparent"
                border="none"
                _hover={{ color: colors.textPrimary }}
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-expanded={mobileOpen}
                aria-controls="mobile-nav"
                aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {mobileOpen ? 'CLOSE' : 'MENU'}
              </Box>

              {isLoggedIn ? (
                <Flex gap={3} align="center" display={{ base: 'none', sm: 'flex' }}>
                  <Text
                    fontSize="13px"
                    color={colors.textSecondary}
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {session.user?.name}
                  </Text>
                  <Box
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
                  </Box>
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
                  animation: 'pulseGlowSoft 3s infinite',
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
          ref={mobileMenuRef}
          id="mobile-nav"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
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
            {navLinks.map((link, i) => (
              <ChakraLink
                key={link.href}
                asChild
                fontSize="24px"
                color={colors.textSecondary}
                letterSpacing="0.1em"
                _hover={{ color: colors.accent }}
                transition="color 0.2s"
                style={{ fontFamily: 'var(--font-display)', animation: `fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${(0.05 + i * 0.06).toFixed(2)}s both` }}
                onClick={() => setMobileOpen(false)}
              >
                <Link href={link.href}>{link.label.toUpperCase()}</Link>
              </ChakraLink>
            ))}
            {isLoggedIn ? (
              <Box
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
              </Box>
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
