'use client';

import { signOut } from 'next-auth/react';
import { Box, Flex, Text, Link as ChakraLink } from '@chakra-ui/react';
import NextLink from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

const navItems = [
  { label: 'Dashboard', href: '/driver' },
  { label: 'Jobs', href: '/driver/jobs' },
  { label: 'Profile', href: '/driver/profile' },
];

export function DriverShell({
  userName,
  isOnline,
  children,
}: {
  userName: string;
  isOnline: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box minH="100vh" bg={c.bg}>
      {/* Top navigation */}
      <Box
        as="header"
        bg={c.surface}
        borderBottom="1px solid"
        borderColor={c.border}
        px={{ base: 3, md: 6 }}
        py={{ base: 3, md: 4 }}
        style={anim.fadeIn('0.4s')}
      >
        <Flex
          justify="space-between"
          align="center"
          maxW="1200px"
          mx="auto"
          gap={2}
        >
          <Flex align="center" gap={{ base: 4, md: 8 }} minW={0} flex={1}>
            <ChakraLink
              asChild
              fontWeight="bold"
              fontSize={{ base: 'md', md: 'lg' }}
              color={c.text}
              flexShrink={0}
              _hover={{ textDecoration: 'none', color: c.accent }}
              transition="color 0.2s"
            >
              <NextLink href="/">Tyre Rescue Driver</NextLink>
            </ChakraLink>
            <Flex as="nav" gap={{ base: 3, md: 6 }}>
              <ChakraLink
                asChild
                fontWeight="medium"
                fontSize={{ base: '13px', md: '14px' }}
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
                  fontSize={{ base: '13px', md: '14px' }}
                  color={c.muted}
                  _hover={{ color: c.text, textDecoration: 'none' }}
                >
                  <NextLink href={item.href}>{item.label}</NextLink>
                </ChakraLink>
              ))}
            </Flex>
          </Flex>
          <Flex align="center" gap={{ base: 2, md: 4 }} flexShrink={0}>
            <Text
              fontSize={{ base: 'xs', md: 'sm' }}
              fontWeight="medium"
              color={isOnline ? 'green.400' : c.muted}
              display={{ base: 'none', sm: 'block' }}
            >
              {isOnline ? 'Online' : 'Offline'}
            </Text>
            <Text
              fontSize={{ base: 'xs', md: 'sm' }}
              color={c.muted}
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
              maxW={{ base: '80px', sm: '150px' }}
            >
              {userName}
            </Text>
            <Text
              as="button"
              fontSize="13px"
              color={c.muted}
              bg="transparent"
              border="none"
              cursor="pointer"
              _hover={{ color: 'red.400' }}
              transition="color 0.2s"
              flexShrink={0}
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              Sign Out
            </Text>
          </Flex>
        </Flex>
      </Box>

      {/* Main content */}
      <Box maxW="1200px" mx="auto" p={{ base: 4, md: 6 }}>
        {children}
      </Box>
    </Box>
  );
}
