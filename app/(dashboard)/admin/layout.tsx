import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Box, Flex, VStack, Link as ChakraLink, Text, Heading } from '@chakra-ui/react';
import NextLink from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';

const navItems = [
  { label: 'Bookings', href: '/admin/bookings' },
  { label: 'Drivers', href: '/admin/drivers' },
  { label: 'Inventory', href: '/admin/inventory' },
  { label: 'Pricing', href: '/admin/pricing' },
  { label: 'Availability', href: '/admin/availability' },
  { label: 'Testimonials', href: '/admin/testimonials' },
  { label: 'FAQ', href: '/admin/faq' },
  { label: 'Audit Log', href: '/admin/audit' },
  { label: 'Content', href: '/admin/content' },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  if (session.user.role !== 'admin') {
    redirect('/login');
  }

  return (
    <Flex minH="100vh">
      {/* Sidebar */}
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
          Admin Panel
        </Heading>
        
        <VStack align="stretch" gap={1}>
          {navItems.map((item) => (
            <ChakraLink
              key={item.href}
              asChild
              px={3}
              py={2}
              borderRadius="md"
              _hover={{ bg: c.card, textDecoration: 'none' }}
              transition="background 0.2s"
            >
              <NextLink href={item.href}>
                {item.label}
              </NextLink>
            </ChakraLink>
          ))}
        </VStack>

        <Box mt={8} pt={4} borderTop="1px solid" borderColor={c.border}>
          <Text fontSize="sm" color={c.muted}>
            Signed in as
          </Text>
          <Text fontSize="sm" fontWeight="medium" color={c.text}>
            {session.user.name}
          </Text>
        </Box>
      </Box>

      {/* Main content */}
      <Box ml="240px" flex={1} p={8} bg={c.bg} minH="100vh">
        {children}
      </Box>
    </Flex>
  );
}
