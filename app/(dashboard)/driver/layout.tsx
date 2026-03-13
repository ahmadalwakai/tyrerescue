import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db, drivers } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { Box, Flex, Text, Link as ChakraLink } from '@chakra-ui/react';
import NextLink from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';

const navItems = [
  { label: 'Dashboard', href: '/driver' },
  { label: 'Jobs', href: '/driver/jobs' },
  { label: 'Profile', href: '/driver/profile' },
];

export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  if (session.user.role !== 'driver') {
    redirect('/login');
  }

  // Fetch driver's online status
  const [driver] = await db
    .select({ isOnline: drivers.isOnline })
    .from(drivers)
    .where(eq(drivers.userId, session.user.id))
    .limit(1);

  const isOnline = driver?.isOnline ?? false;

  return (
    <Box minH="100vh" bg={c.bg}>
      {/* Top navigation */}
      <Box
        as="header"
        bg={c.surface}
        borderBottom="1px solid"
        borderColor={c.border}
        px={6}
        py={4}
      >
        <Flex justify="space-between" align="center" maxW="1200px" mx="auto">
          <Flex align="center" gap={8}>
            <Text fontWeight="bold" fontSize="lg" color={c.text}>
              Tyre Rescue Driver
            </Text>
            <Flex as="nav" gap={6}>
              {navItems.map((item) => (
                <ChakraLink
                  key={item.href}
                  asChild
                  fontWeight="medium"
                  color={c.muted}
                  _hover={{ color: c.text, textDecoration: 'none' }}
                >
                  <NextLink href={item.href}>{item.label}</NextLink>
                </ChakraLink>
              ))}
            </Flex>
          </Flex>
          <Flex align="center" gap={4}>
            <Text
              fontSize="sm"
              fontWeight="medium"
              color={isOnline ? 'green.400' : c.muted}
            >
              {isOnline ? 'Online' : 'Offline'}
            </Text>
            <Text fontSize="sm" color={c.muted}>
              {session.user.name}
            </Text>
          </Flex>
        </Flex>
      </Box>

      {/* Main content */}
      <Box maxW="1200px" mx="auto" p={6}>
        {children}
      </Box>
    </Box>
  );
}
