'use client';

import { useState, useEffect, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import { Box, Flex, VStack, Link as ChakraLink, Text, Heading } from '@chakra-ui/react';
import NextLink from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { AdminChatbot } from '@/components/admin/AdminChatbot';
import { BackButton } from '@/components/ui/BackButton';
import { NotificationBell } from '@/components/admin/NotificationBell';
import { SoundToggle } from '@/components/admin/SoundToggle';
import { AdminNotificationProvider } from '@/components/admin/AdminNotificationProvider';
import { NotificationNavBadge } from '@/components/admin/NotificationNavBadge';

const navItems = [
  { label: 'Bookings', href: '/admin/bookings' },
  { label: 'Quick Book', href: '/admin/quick-book' },
  { label: 'Callbacks', href: '/admin/callbacks', badgeKey: 'callbacks' as const },
  { label: 'Messages', href: '/admin/messages', badgeKey: 'messages' as const },
  { label: 'Chat', href: '/admin/chat', badgeKey: 'chat' as const },
  { label: 'SMS', href: '/admin/sms' },
  { label: 'Invoices', href: '/admin/invoices' },
  { label: 'Drivers', href: '/admin/drivers' },
  { label: 'Inventory', href: '/admin/inventory' },
  { label: 'Current Stock', href: '/admin/stock' },
  { label: 'Pricing', href: '/admin/pricing' },
  { label: 'Availability', href: '/admin/availability' },
  { label: 'Testimonials', href: '/admin/testimonials' },
  { label: 'FAQ', href: '/admin/faq' },
  { label: 'Content', href: '/admin/content' },
  { label: 'Hero Media', href: '/admin/hero-media' },
  { label: 'Cookies', href: '/admin/cookies' },
  { label: 'Diagnostics', href: '/admin/diagnostics' },
  { label: 'Driver Sounds', href: '/admin/driver-sounds' },
  { label: 'Audit Log', href: '/admin/audit' },
  { label: 'Notifications', href: '/admin/notifications', isNotifications: true as const },
  { label: 'Analytics', href: '/admin/analytics' },
  { label: 'SEO Analytics', href: '/admin/seo-analytics' },
  { label: 'Visitors', href: '/admin/visitors' },
];

export function AdminShell({
  userName,
  children,
}: {
  userName: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState<{ callbacks: number; messages: number; chat: number }>({ callbacks: 0, messages: 0, chat: 0 });

  const fetchCounts = useCallback(async () => {
    try {
      const [cbRes, msgRes, chatRes] = await Promise.all([
        fetch('/api/admin/callbacks/count'),
        fetch('/api/admin/messages/count'),
        fetch('/api/chat/unread'),
      ]);
      if (cbRes.ok) {
        const cbData = await cbRes.json();
        setBadgeCounts(prev => ({ ...prev, callbacks: cbData.count ?? 0 }));
      }
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        setBadgeCounts(prev => ({ ...prev, messages: msgData.count ?? 0 }));
      }
      if (chatRes.ok) {
        const chatData = await chatRes.json();
        setBadgeCounts(prev => ({ ...prev, chat: chatData.unread ?? 0 }));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);
    return () => clearInterval(interval);
  }, [fetchCounts]);

  return (
    <AdminNotificationProvider>
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
        <ChakraLink
          asChild
          _hover={{ textDecoration: 'none', opacity: 0.8 }}
          transition="opacity 0.2s"
          style={anim.fadeUp()}
        >
          <NextLink href="/">
            <img
              src="/logo.svg"
              alt="Tyre Rescue"
              style={{ height: '32px', width: 'auto', objectFit: 'contain', marginBottom: '4px' }}
            />
          </NextLink>
        </ChakraLink>
        <ChakraLink
          asChild
          fontSize="12px"
          color={c.muted}
          mt={1}
          mb={6}
          display="inline-block"
          _hover={{ color: c.accent, textDecoration: 'none' }}
          transition="color 0.2s"
        >
          <NextLink href="/">← Back to Site</NextLink>
        </ChakraLink>

        <Heading size="md" mb={4} color={c.text} fontSize="14px" fontWeight="600" letterSpacing="0.05em" textTransform="uppercase">
          Admin Panel
        </Heading>

        <VStack align="stretch" gap={1}>
          {navItems.map((item, i) => (
            <ChakraLink
              key={item.href}
              asChild
              px={3}
              py={2}
              borderRadius="md"
              color={c.text}
              _hover={{ bg: c.card, textDecoration: 'none' }}
              transition="background 0.2s"
              style={anim.stagger('fadeUp', i, '0.3s', 0.05)}
            >
              <NextLink href={item.href}>
                <Flex align="center" w="100%">
                  <Text flex={1}>{item.label}</Text>
                  {'isNotifications' in item && item.isNotifications ? (
                    <NotificationNavBadge />
                  ) : item.badgeKey && badgeCounts[item.badgeKey] > 0 ? (
                    <Flex
                      align="center"
                      justify="center"
                      bg={c.accent}
                      color="#09090B"
                      fontSize="10px"
                      fontWeight="700"
                      minW="18px"
                      h="18px"
                      borderRadius="full"
                      ml="auto"
                      px="4px"
                    >
                      {badgeCounts[item.badgeKey]}
                    </Flex>
                  ) : null}
                </Flex>
              </NextLink>
            </ChakraLink>
          ))}
        </VStack>

        <Box mt={8} pt={4} borderTop="1px solid" borderColor={c.border}>
          <Flex align="center" justify="space-between" mb={2}>
            <Box>
              <Text fontSize="sm" color={c.muted}>
                Signed in as
              </Text>
              <Text fontSize="sm" fontWeight="medium" color={c.text}>
                {userName}
              </Text>
            </Box>
            <SoundToggle />
            <NotificationBell />
          </Flex>
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
        <ChakraLink
          asChild
          fontSize="20px"
          color={c.text}
          letterSpacing="0.05em"
          _hover={{ textDecoration: 'none', color: c.accent }}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <NextLink href="/">TYRE RESCUE</NextLink>
        </ChakraLink>
        <Flex align="center" gap="2">
          <NotificationBell />
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
        </Flex>
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
                <NextLink href={item.href}>
                  <Flex align="center" w="100%">
                    <Text flex={1}>{item.label}</Text>
                    {'isNotifications' in item && item.isNotifications ? (
                      <NotificationNavBadge />
                    ) : item.badgeKey && badgeCounts[item.badgeKey] > 0 ? (
                      <Flex
                        align="center"
                        justify="center"
                        bg={c.accent}
                        color="#09090B"
                        fontSize="10px"
                        fontWeight="700"
                        minW="18px"
                        h="18px"
                        borderRadius="full"
                        ml="auto"
                        px="4px"
                      >
                        {badgeCounts[item.badgeKey]}
                      </Flex>
                    ) : null}
                  </Flex>
                </NextLink>
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
        flex={1}
        p={{ base: 4, md: 8 }}
        pt={{ base: '72px', md: 8 }}
        bg={c.bg}
        minH="100vh"
      >
        <Box mb={2}>
          <BackButton />
        </Box>
        {children}
        <AdminChatbot />
      </Box>
    </Flex>
    </AdminNotificationProvider>
  );
}
