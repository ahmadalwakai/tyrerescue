'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { Box, Flex, Text, VStack, Link as ChakraLink } from '@chakra-ui/react';
import NextLink from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { BackButton } from '@/components/ui/BackButton';
import { PRESENCE_LABELS, PRESENCE_COLORS, type DriverPresenceState } from '@/lib/driver-presence';

const navItems = [
  { label: 'Dashboard', href: '/driver' },
  { label: 'Jobs', href: '/driver/jobs' },
  { label: 'Profile', href: '/driver/profile' },
];

const PRESENCE_TEXT_COLORS: Record<DriverPresenceState, string> = {
  online_fresh: 'green.400',
  online_stale: 'yellow.400',
  active_job_fresh: 'blue.400',
  active_job_stale: 'orange.400',
  offline: c.muted,
};

export function DriverShell({
  userName,
  isOnline,
  presenceState = 'offline',
  children,
}: {
  userName: string;
  isOnline: boolean;
  presenceState?: DriverPresenceState;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box minH="100vh" bg={c.bg}>
      {/* ── Desktop header (md+) ── */}
      <Box
        as="header"
        bg={c.surface}
        borderBottom="1px solid"
        borderColor={c.border}
        px={6}
        py={4}
        display={{ base: 'none', md: 'block' }}
        style={anim.fadeIn('0.4s')}
      >
        <Flex
          justify="space-between"
          align="center"
          maxW="1200px"
          mx="auto"
          gap={2}
        >
          <Flex align="center" gap={8} minW={0} flex={1}>
            <ChakraLink
              asChild
              fontWeight="bold"
              fontSize="lg"
              color={c.text}
              flexShrink={0}
              _hover={{ textDecoration: 'none', color: c.accent }}
              transition="color 0.2s"
            >
              <NextLink href="/">Tyre Rescue Driver</NextLink>
            </ChakraLink>
            <Flex as="nav" gap={6}>
              <ChakraLink
                asChild
                fontWeight="medium"
                fontSize="14px"
                color={c.accent}
                _hover={{ color: c.text, textDecoration: 'none' }}
              >
                <NextLink href="/">← Site</NextLink>
              </ChakraLink>
              {navItems.map((item) => (
                <ChakraLink
                  key={item.href}
                  asChild
                  fontWeight="medium"
                  fontSize="14px"
                  color={c.muted}
                  _hover={{ color: c.text, textDecoration: 'none' }}
                >
                  <NextLink href={item.href}>{item.label}</NextLink>
                </ChakraLink>
              ))}
            </Flex>
          </Flex>
          <Flex align="center" gap={4} flexShrink={0}>
            <Text
              fontSize="sm"
              fontWeight="medium"
              color={PRESENCE_TEXT_COLORS[presenceState]}
            >
              {PRESENCE_LABELS[presenceState]}
            </Text>
            <Text
              fontSize="sm"
              color={c.muted}
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
              maxW="150px"
            >
              {userName}
            </Text>
            <Box
              as="button"
              fontSize="13px"
              color={c.muted}
              bg="transparent"
              border="none"
              cursor="pointer"
              _hover={{ color: 'red.400' }}
              transition="color 0.2s"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              Sign Out
            </Box>
          </Flex>
        </Flex>
      </Box>

      {/* ── Mobile top bar (base–sm) ── */}
      <Box
        display={{ base: 'flex', md: 'none' }}
        position="fixed"
        top={0}
        left={0}
        right={0}
        h="56px"
        bg={c.surface}
        borderBottom={`1px solid ${c.border}`}
        alignItems="center"
        justifyContent="space-between"
        px={4}
        zIndex={100}
      >
        <ChakraLink
          asChild
          fontWeight="bold"
          fontSize="md"
          color={c.text}
          _hover={{ textDecoration: 'none', color: c.accent }}
        >
          <NextLink href="/driver">Tyre Rescue Driver</NextLink>
        </ChakraLink>
        <Text
          as="button"
          fontSize="13px"
          fontWeight="600"
          color={c.accent}
          cursor="pointer"
          bg="transparent"
          border="none"
          onClick={() => setMobileOpen(true)}
        >
          MENU
        </Text>
      </Box>

      {/* ── Mobile full-screen overlay ── */}
      {mobileOpen && (
        <Box
          position="fixed"
          inset={0}
          bg={c.bg}
          zIndex={200}
          display={{ base: 'flex', md: 'none' }}
          flexDirection="column"
        >
          {/* Close bar */}
          <Flex
            h="56px"
            align="center"
            justify="flex-end"
            px={4}
            flexShrink={0}
          >
            <Text
              as="button"
              fontSize="13px"
              fontWeight="600"
              color={c.accent}
              cursor="pointer"
              bg="transparent"
              border="none"
              onClick={() => setMobileOpen(false)}
            >
              CLOSE
            </Text>
          </Flex>

          {/* Nav links */}
          <VStack align="stretch" gap={0} flex={1} overflowY="auto">
            <ChakraLink
              asChild
              py="20px"
              px="24px"
              fontSize="16px"
              color={c.accent}
              borderBottom={`1px solid ${c.border}`}
              _hover={{ bg: c.surface, textDecoration: 'none' }}
              onClick={() => setMobileOpen(false)}
            >
              <NextLink href="/">← Back to Site</NextLink>
            </ChakraLink>
            {navItems.map((item) => (
              <ChakraLink
                key={item.href}
                asChild
                py="20px"
                px="24px"
                fontSize="16px"
                color={c.text}
                borderBottom={`1px solid ${c.border}`}
                _hover={{ bg: c.surface, textDecoration: 'none' }}
                onClick={() => setMobileOpen(false)}
              >
                <NextLink href={item.href}>{item.label}</NextLink>
              </ChakraLink>
            ))}
          </VStack>

          {/* Footer: presence, user, sign out */}
          <Box p={4} borderTop={`1px solid ${c.border}`} flexShrink={0}>
            <Flex align="center" gap={2} mb={3}>
              <Text
                fontSize="sm"
                fontWeight="medium"
                color={PRESENCE_TEXT_COLORS[presenceState]}
              >
                {PRESENCE_LABELS[presenceState]}
              </Text>
              <Text fontSize="sm" color={c.muted}>
                — {userName}
              </Text>
            </Flex>
            <Box
              as="button"
              w="100%"
              py={3}
              bg="transparent"
              border={`1px solid ${c.border}`}
              borderRadius="md"
              color={c.muted}
              fontSize="sm"
              cursor="pointer"
              minH="48px"
              _hover={{ borderColor: 'red.400', color: 'red.400' }}
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              Sign Out
            </Box>
          </Box>
        </Box>
      )}

      {/* Main content */}
      <Box
        maxW="1200px"
        mx="auto"
        p={{ base: 4, md: 6 }}
        pt={{ base: '72px', md: 6 }}
      >
        <Box mb={2}>
          <BackButton />
        </Box>
        {children}
      </Box>
    </Box>
  );
}
