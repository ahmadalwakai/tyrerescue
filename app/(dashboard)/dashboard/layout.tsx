import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Box, Flex, VStack, Text, Heading } from '@chakra-ui/react';
import NextLink from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';

const navItems = [
  { label: 'Overview', href: '/dashboard' },
  { label: 'My Bookings', href: '/dashboard/bookings' },
  { label: 'Invoices', href: '/dashboard/invoices' },
  { label: 'Profile', href: '/dashboard/profile' },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  if (session.user.role !== 'customer' && session.user.role !== 'admin') {
    redirect('/login');
  }

  return (
    <Flex minH="100vh">
      <Box
        as="aside"
        w="240px"
        bg={c.surface}
        color={c.text}
        p={6}
        position="fixed"
        h="100vh"
        overflowY="auto"
      >
        <Heading size="md" mb={8} color={c.text}>
          My Account
        </Heading>

        <VStack align="stretch" gap={1}>
          {navItems.map((item) => (
            <Box
              key={item.href}
              asChild
              px={3}
              py={2}
              borderRadius="md"
              _hover={{ bg: c.card, textDecoration: 'none' }}
              transition="background 0.2s"
            >
              <NextLink href={item.href} style={{ color: c.muted, textDecoration: 'none' }}>
                {item.label}
              </NextLink>
            </Box>
          ))}
        </VStack>

        <Box mt={8} pt={4} borderTop="1px solid" borderColor={c.border}>
          <Text fontSize="sm" color={c.muted}>
            Signed in as
          </Text>
          <Text fontSize="sm" color={c.text} fontWeight="500" mt={1}>
            {session.user.name}
          </Text>
        </Box>
      </Box>

      <Box ml="240px" flex="1" bg={c.bg} minH="100vh" p={8}>
        {children}
      </Box>
    </Flex>
  );
}
