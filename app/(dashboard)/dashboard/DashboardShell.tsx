'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { Box, Flex, VStack, Text, Heading, Link as ChakraLink } from '@chakra-ui/react';
import NextLink from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

const navItems = [
  { label: 'Overview', href: '/dashboard' },
  { label: 'My Bookings', href: '/dashboard/bookings' },
  { label: 'Invoices', href: '/dashboard/invoices' },
  { label: 'Profile', href: '/dashboard/profile' },
];

export function DashboardShell({
  userName,
  children,
}: {
  userName: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Flex minH="100vh">
      {/* Desktop Sidebar */}
      <Box
        as="aside"
        w="240px"
        bg={c.surface}
        color={c.text}
        p={6}
        position="fixed"
        h="100vh"
        overflowY="auto"
        display={{ base: 'none', md: 'block' }}
      >
        <Heading size="md" mb={8} color={c.text} style={anim.fadeUp()}>
          My Account
        </Heading>

        <VStack align="stretch" gap={1}>
          {navItems.map((item, i) => (
            <ChakraLink
              key={item.href}
              asChild
              px={3}
              py={2}
              borderRadius="md"
              color={c.muted}
              _hover={{ bg: c.card, textDecoration: 'none' }}
              transition="background 0.2s"
              style={anim.stagger('fadeUp', i, '0.3s', 0.05)}
            >
              <NextLink href={item.href}>{item.label}</NextLink>
            </ChakraLink>
          ))}
        </VStack>

        <Box mt={8} pt={4} borderTop="1px solid" borderColor={c.border}>
          <Text fontSize="sm" color={c.muted}>
            Signed in as
          </Text>
          <Text fontSize="sm" fontWeight="500" color={c.text} mt={1}>
            {userName}
          </Text>
        </Box>

        <Box mt={4} pt={4} borderTop={`1px solid ${c.border}`}>
          <Box
            as="button"
            w="100%"
            py={2}
            px={3}
            bg="transparent"
            border={`1px solid ${c.border}`}
            borderRadius="md"
            color={c.muted}
            fontSize="sm"
            cursor="pointer"
            transition="all 0.2s"
            _hover={{ borderColor: 'red.400', color: 'red.400' }}
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            Sign Out
          </Box>
        </Box>
      </Box>

      {/* Mobile Top Bar */}
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
        <Text
          fontSize="20px"
          color={c.text}
          letterSpacing="0.05em"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          TYRE RESCUE
        </Text>
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

      {/* Mobile Full-Screen Overlay */}
      {mobileOpen && (
        <Box
          position="fixed"
          inset={0}
          bg={c.bg}
          zIndex={200}
          display={{ base: 'flex', md: 'none' }}
          flexDirection="column"
        >
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

          <VStack align="stretch" gap={0} flex={1} overflowY="auto">
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

          <Box p={4} borderTop={`1px solid ${c.border}`} flexShrink={0}>
            <Text fontSize="sm" color={c.muted} mb={3}>
              Signed in as {userName}
            </Text>
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
        ml={{ base: 0, md: '240px' }}
        flex="1"
        bg={c.bg}
        minH="100vh"
        p={{ base: 4, md: 8 }}
        pt={{ base: '72px', md: 8 }}
      >
        {children}
      </Box>
    </Flex>
  );
}
